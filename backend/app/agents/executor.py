import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from mistralai import Mistral
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.registry import AgentRegistry
from app.config import get_settings
from app.models.database import Event, Session
from app.models.schemas import SSEEvent
from app.services.streaming import StreamManager


class PipelineExecutor:
    def __init__(
        self,
        session_id: str,
        mistral_client: Mistral,
        agent_registry: AgentRegistry,
        db: AsyncSession,
        stream_manager: StreamManager,
    ) -> None:
        self.session_id = session_id
        self.client = mistral_client
        self.registry = agent_registry
        self.db = db
        self.stream_manager = stream_manager
        self.settings = get_settings()
        self.seq = 0

    async def execute(self, user_prompt: str, dataset_path: str | None) -> None:
        try:
            await self._publish("pipeline.started", {"status": "started", "session_id": self.session_id})
            await self._set_status("eda_running")

            orchestrator = await self.registry.get_orchestrator()
            orchestrator_id = self._agent_id(orchestrator)
            conversation_id = await self._start_conversation(orchestrator_id, user_prompt, dataset_path)
            if conversation_id:
                await self._update_session(conversation_id=conversation_id)

            await self._publish("eda.started", {"session_id": self.session_id})
            eda_raw = await self._run_phase(
                agent=await self.registry.get_eda_agent(),
                prompt=self._eda_prompt(user_prompt, dataset_path),
            )
            eda_data = self._to_structured_payload(eda_raw)
            await self._update_session(eda_results=json.dumps(eda_data))
            await self._publish("eda.completed", {"results": eda_data})

            await self._set_status("algorithm_running")
            await self._publish("algorithm.started", {"session_id": self.session_id})
            algorithm_raw = await self._run_phase(
                agent=await self.registry.get_algorithm_agent(),
                prompt=self._algorithm_prompt(eda_data),
            )
            algorithm_data = self._to_structured_payload(algorithm_raw)
            await self._update_session(algorithm_recommendations=json.dumps(algorithm_data))
            await self._publish("algorithm.completed", {"recommendations": algorithm_data})

            await self._set_status("codegen_running")
            await self._publish("codegen.started", {"session_id": self.session_id})
            code_output = await self._run_phase(
                agent=await self.registry.get_code_agent(),
                prompt=self._code_prompt(eda_data, algorithm_data, dataset_path),
            )
            await self._update_session(generated_code=code_output)
            await self._persist_generated_code(code_output)
            await self._publish("codegen.completed", {"size": len(code_output)})

            await self._set_status("validation_running")
            await self._publish("validation.started", {"session_id": self.session_id})
            validation_raw = await self._run_phase(
                agent=await self.registry.get_validation_agent(),
                prompt=self._validation_prompt(code_output, dataset_path),
            )
            validation_data = self._to_structured_payload(validation_raw)
            await self._update_session(validation_results=json.dumps(validation_data))
            await self._publish("validation.completed", {"validation": validation_data})

            await self._set_status("completed")
            await self._publish("pipeline.completed", {"status": "completed", "session_id": self.session_id})
        except Exception as exc:
            await self._set_status("failed")
            await self._publish("pipeline.failed", {"error": str(exc)})
            raise

    async def _run_phase(self, agent: Any, prompt: str) -> str:
        agent_id = self._agent_id(agent)
        if agent_id:
            response_text = await self._run_agent_conversation(agent_id, prompt)
            if response_text.strip():
                return response_text
        return await self._run_model_fallback(prompt)

    async def _start_conversation(self, agent_id: str, user_prompt: str, dataset_path: str | None) -> str | None:
        if not agent_id:
            return None

        prompt = self._orchestrator_prompt(user_prompt, dataset_path)

        def run() -> Any:
            conversations = getattr(getattr(self.client, "beta", None), "conversations", None)
            if conversations is None:
                return None
            start_method = getattr(conversations, "start", None) or getattr(conversations, "create", None)
            if start_method is None:
                return None
            for payload in ({"agent_id": agent_id, "inputs": prompt}, {"agent_id": agent_id, "input": prompt}):
                try:
                    return start_method(**payload)
                except TypeError:
                    continue
            return None

        response = await asyncio.to_thread(run)
        return self._conversation_id(response)

    async def _run_agent_conversation(self, agent_id: str, prompt: str) -> str:
        def run() -> Any:
            conversations = getattr(getattr(self.client, "beta", None), "conversations", None)
            if conversations is None:
                return None

            if hasattr(conversations, "start"):
                for payload in ({"agent_id": agent_id, "inputs": prompt}, {"agent_id": agent_id, "input": prompt}):
                    try:
                        return conversations.start(**payload)
                    except TypeError:
                        continue
            if hasattr(conversations, "create"):
                for payload in ({"agent_id": agent_id, "inputs": prompt}, {"agent_id": agent_id, "input": prompt}):
                    try:
                        return conversations.create(**payload)
                    except TypeError:
                        continue
            return None

        response = await asyncio.to_thread(run)
        return self._extract_text(response)

    async def _run_model_fallback(self, prompt: str) -> str:
        def run() -> Any:
            return self.client.chat.complete(
                model=self.settings.MISTRAL_DEFAULT_MODEL,
                messages=[{"role": "user", "content": prompt}],
            )

        response = await asyncio.to_thread(run)
        return self._extract_text(response)

    async def _set_status(self, status: str) -> None:
        await self._update_session(status=status)

    async def _update_session(self, **fields: Any) -> None:
        session = await self._get_session()
        for key, value in fields.items():
            setattr(session, key, value)
        await self.db.commit()

    async def _get_session(self) -> Session:
        session = await self.db.scalar(select(Session).where(Session.id == self.session_id))
        if session is None:
            raise RuntimeError(f"Session {self.session_id} not found")
        return session

    async def _publish(self, event_type: str, payload: dict[str, Any]) -> None:
        self.seq += 1
        event = SSEEvent(
            session_id=self.session_id,
            seq=self.seq,
            ts=datetime.now(UTC).isoformat(),
            type=event_type,
            payload=payload,
        )
        await self.stream_manager.publish(self.session_id, event)
        db_event = Event(
            session_id=self.session_id,
            seq=self.seq,
            event_type=event_type,
            payload=json.dumps(payload),
        )
        self.db.add(db_event)
        await self.db.commit()

    async def _persist_generated_code(self, code: str) -> None:
        output_dir = Path(self.settings.ARTIFACT_DIR) / self.session_id
        output_dir.mkdir(parents=True, exist_ok=True)
        code_path = output_dir / "generated_pipeline.py"
        code_path.write_text(code, encoding="utf-8")

    def _to_structured_payload(self, text: str) -> dict[str, Any]:
        parsed = self._parse_json(text)
        if isinstance(parsed, dict):
            return parsed
        if isinstance(parsed, list):
            return {"items": parsed}
        return {"raw": text}

    def _parse_json(self, text: str) -> Any:
        raw = text.strip()
        if not raw:
            return {}
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            start = raw.find("{")
            end = raw.rfind("}")
            if start != -1 and end != -1 and end > start:
                try:
                    return json.loads(raw[start : end + 1])
                except json.JSONDecodeError:
                    return {"raw": raw}
            return {"raw": raw}

    def _extract_text(self, response: Any) -> str:
        if response is None:
            return ""
        if isinstance(response, str):
            return response
        if isinstance(response, dict):
            text = self._extract_text_from_dict(response)
            return text if text else json.dumps(response, default=str)

        as_dict = getattr(response, "model_dump", None)
        if callable(as_dict):
            dumped = as_dict()
            text = self._extract_text_from_dict(dumped)
            if text:
                return text

        for attr in ("output_text", "text", "content"):
            value = getattr(response, attr, None)
            if isinstance(value, str) and value.strip():
                return value

        message = getattr(response, "message", None)
        if message is not None:
            message_text = self._extract_text(message)
            if message_text:
                return message_text

        choices = getattr(response, "choices", None)
        if isinstance(choices, list) and choices:
            return self._extract_text(choices[0])

        outputs = getattr(response, "outputs", None)
        if isinstance(outputs, list) and outputs:
            for output in outputs:
                output_text = self._extract_text(output)
                if output_text:
                    return output_text

        return str(response)

    def _extract_text_from_dict(self, payload: dict[str, Any]) -> str:
        for key in ("output_text", "text"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value

        message = payload.get("message")
        if isinstance(message, dict):
            message_content = message.get("content")
            extracted = self._extract_content(message_content)
            if extracted:
                return extracted

        choices = payload.get("choices")
        if isinstance(choices, list):
            for choice in choices:
                if isinstance(choice, dict):
                    extracted = self._extract_text_from_dict(choice)
                    if extracted:
                        return extracted

        outputs = payload.get("outputs")
        if isinstance(outputs, list):
            for output in outputs:
                if isinstance(output, dict):
                    output_text = self._extract_text_from_dict(output)
                    if output_text:
                        return output_text

        content = payload.get("content")
        return self._extract_content(content)

    def _extract_content(self, content: Any) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            pieces: list[str] = []
            for item in content:
                if isinstance(item, str):
                    pieces.append(item)
                elif isinstance(item, dict):
                    text = item.get("text")
                    if isinstance(text, str):
                        pieces.append(text)
            return "\n".join(pieces).strip()
        if isinstance(content, dict):
            text = content.get("text")
            if isinstance(text, str):
                return text
        return ""

    def _conversation_id(self, response: Any) -> str | None:
        if response is None:
            return None
        if isinstance(response, dict):
            conversation_id = response.get("id") or response.get("conversation_id")
            if conversation_id is not None:
                return str(conversation_id)
            return None
        for attr in ("id", "conversation_id"):
            value = getattr(response, attr, None)
            if value:
                return str(value)
        dumped = getattr(response, "model_dump", None)
        if callable(dumped):
            data = dumped()
            if isinstance(data, dict):
                conversation_id = data.get("id") or data.get("conversation_id")
                if conversation_id is not None:
                    return str(conversation_id)
        return None

    def _agent_id(self, agent: Any) -> str:
        if isinstance(agent, dict):
            return str(agent.get("id", ""))
        return str(getattr(agent, "id", ""))

    def _orchestrator_prompt(self, user_prompt: str, dataset_path: str | None) -> str:
        return (
            "Initialize an anomaly detection pipeline session. "
            f"User prompt: {user_prompt}. "
            f"Dataset path: {dataset_path or 'not_provided'}. "
            "Plan execution order: EDA, algorithm recommendation, code generation, validation."
        )

    def _eda_prompt(self, user_prompt: str, dataset_path: str | None) -> str:
        return (
            "Perform exploratory data analysis for this anomaly detection task. "
            f"User intent: {user_prompt}. "
            f"Dataset location: {dataset_path or 'not_provided'}. "
            "Return a strict JSON object with keys: summary, frequency, missing_values, trend, seasonality, "
            "stationarity, statistics, notes."
        )

    def _algorithm_prompt(self, eda_data: dict[str, Any]) -> str:
        return (
            "Recommend the top 3 anomaly detection algorithms based on this EDA JSON: "
            f"{json.dumps(eda_data)}. "
            "Return strict JSON with key recommendations as an array of objects containing rank, algorithm, "
            "fit_reason, risks, compute_cost."
        )

    def _code_prompt(self, eda_data: dict[str, Any], algorithm_data: dict[str, Any], dataset_path: str | None) -> str:
        return (
            "Generate production-ready Python anomaly detection code. "
            f"Dataset path: {dataset_path or 'not_provided'}. "
            f"EDA JSON: {json.dumps(eda_data)}. "
            f"Algorithm JSON: {json.dumps(algorithm_data)}. "
            "Return executable Python code only."
        )

    def _validation_prompt(self, code_output: str, dataset_path: str | None) -> str:
        return (
            "Validate anomaly detection outputs statistically. "
            f"Dataset path: {dataset_path or 'not_provided'}. "
            f"Generated code: {code_output[:8000]}. "
            "Return strict JSON with keys: metrics, diagnostics, confidence, caveats, recommendation."
        )
