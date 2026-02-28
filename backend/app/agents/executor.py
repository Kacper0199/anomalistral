import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pandas as pd
from mistralai import Mistral
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.registry import AgentRegistry
from app.config import get_settings
from app.models.database import Event, Session
from app.models.schemas import SSEEvent
from app.services.retry import retry_sync
from app.services.streaming import StreamManager

MAX_DATASET_CONTEXT_ROWS = 5
MAX_DATASET_CONTEXT_COLS = 40


def _build_dataset_context(dataset_path: str) -> str:
    path = Path(dataset_path)
    if not path.exists():
        return ""
    try:
        df = pd.read_csv(path) if path.suffix.lower() == ".csv" else pd.read_json(path)
    except Exception:
        return ""

    cols = list(df.columns[:MAX_DATASET_CONTEXT_COLS])
    dtypes = {str(c): str(df[c].dtype) for c in cols}
    sample = df.head(MAX_DATASET_CONTEXT_ROWS).to_dict(orient="records")
    stats = {
        "rows": len(df),
        "columns": [str(c) for c in df.columns],
        "dtypes": dtypes,
        "null_counts": {str(c): int(df[c].isnull().sum()) for c in cols},
    }
    return json.dumps({"statistics": stats, "sample_rows": sample}, default=str)


def _upload_file_to_mistral(client: Mistral, dataset_path: str) -> str | None:
    path = Path(dataset_path)
    if not path.exists():
        return None
    try:
        with open(path, "rb") as fh:
            result = retry_sync(
                client.files.upload,
                file={"file_name": path.name, "content": fh},
                purpose="code_interpreter",
            )
        return str(result.id) if result and hasattr(result, "id") else None
    except Exception:
        return None


def _build_inputs_with_file(prompt: str, file_id: str | None) -> Any:
    if not file_id:
        return prompt
    from mistralai.models import MessageInputEntry, TextChunk, ToolFileChunk

    return [
        MessageInputEntry(
            role="user",
            content=[
                ToolFileChunk(tool="code_interpreter", file_id=file_id),
                TextChunk(text=prompt),
            ],
        )
    ]


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
        self._current_phase = "init"

    async def execute(self, user_prompt: str, dataset_path: str | None) -> None:
        try:
            self._current_phase = "init"
            await self._publish("pipeline.started", {"status": "started", "session_id": self.session_id})
            await self._set_status("eda_running")

            file_id: str | None = None
            dataset_context = ""
            if dataset_path:
                dataset_context = await asyncio.to_thread(_build_dataset_context, dataset_path)
                file_id = await asyncio.to_thread(_upload_file_to_mistral, self.client, dataset_path)
                if file_id:
                    await self._update_session(mistral_file_id=file_id)

            self._current_phase = "eda"
            await self._publish("eda.started", {"session_id": self.session_id})
            eda_agent_id = self._agent_id(await self.registry.get_eda_agent())
            eda_raw, conversation_id = await self._run_agent_phase(
                agent_id=eda_agent_id,
                prompt=self._eda_prompt(user_prompt, dataset_context),
                file_id=file_id,
            )
            if conversation_id:
                await self._update_session(conversation_id=conversation_id)
            eda_data = self._to_structured_payload(eda_raw)
            await self._update_session(eda_results=json.dumps(eda_data))
            await self._publish("eda.completed", {"results": eda_data})

            self._current_phase = "algorithm"
            await self._set_status("algorithm_running")
            await self._publish("algorithm.started", {"session_id": self.session_id})
            algorithm_agent_id = self._agent_id(await self.registry.get_algorithm_agent())
            algorithm_raw, _ = await self._run_agent_phase(
                agent_id=algorithm_agent_id,
                prompt=self._algorithm_prompt(eda_data),
            )
            algorithm_data = self._to_structured_payload(algorithm_raw)
            await self._update_session(algorithm_recommendations=json.dumps(algorithm_data))
            await self._publish("algorithm.completed", {"recommendations": algorithm_data})

            self._current_phase = "codegen"
            await self._set_status("codegen_running")
            await self._publish("codegen.started", {"session_id": self.session_id})
            code_agent_id = self._agent_id(await self.registry.get_code_agent())
            code_output, _ = await self._run_agent_phase(
                agent_id=code_agent_id,
                prompt=self._code_prompt(eda_data, algorithm_data, dataset_context),
                file_id=file_id,
            )
            await self._update_session(generated_code=code_output)
            await self._persist_generated_code(code_output)
            await self._publish("codegen.completed", {"size": len(code_output)})

            self._current_phase = "validation"
            await self._set_status("validation_running")
            await self._publish("validation.started", {"session_id": self.session_id})
            validation_agent_id = self._agent_id(await self.registry.get_validation_agent())
            validation_raw, _ = await self._run_agent_phase(
                agent_id=validation_agent_id,
                prompt=self._validation_prompt(code_output, dataset_context),
                file_id=file_id,
            )
            validation_data = self._to_structured_payload(validation_raw)
            await self._update_session(validation_results=json.dumps(validation_data))
            await self._publish("validation.completed", {"validation": validation_data})

            self._current_phase = "complete"
            await self._set_status("completed")
            await self._publish("pipeline.completed", {"status": "completed", "session_id": self.session_id})
        except Exception as exc:
            message = self._error_message(exc)
            await self._set_status("failed")
            await self._publish("pipeline.failed", {"error": message, "phase": self._current_phase})
            raise

    async def chat(self, message: str) -> str:
        session = await self._get_session()
        conversation_id = session.conversation_id
        if conversation_id is None or not conversation_id.strip():
            raise RuntimeError("Conversation is not initialized")

        response = await self._append_conversation(conversation_id=conversation_id, message=message)
        response_text = self._extract_conversation_text(response)
        await self._publish("chat.response", {"text": response_text, "agent": "orchestrator"})
        return response_text

    async def _run_agent_phase(
        self,
        agent_id: str,
        prompt: str,
        file_id: str | None = None,
    ) -> tuple[str, str | None]:
        if not agent_id:
            raise RuntimeError("Agent is missing id")
        return await asyncio.to_thread(self._call_agent, agent_id, prompt, file_id)

    def _call_agent(self, agent_id: str, prompt: str, file_id: str | None = None) -> tuple[str, str | None]:
        inputs = _build_inputs_with_file(prompt, file_id)
        response = retry_sync(
            self.client.beta.conversations.start,
            agent_id=agent_id,
            inputs=inputs,
        )
        return self._extract_conversation_text(response), self._conversation_id(response)

    async def _append_conversation(self, conversation_id: str, message: str) -> Any:
        return await asyncio.to_thread(
            retry_sync,
            self.client.beta.conversations.append,
            conversation_id=conversation_id,
            inputs=message,
        )

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
        if self.seq == 0:
            max_seq = await self.db.scalar(select(func.max(Event.seq)).where(Event.session_id == self.session_id))
            self.seq = int(max_seq or 0)

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
        content = response.choices[0].message.content or ""
        return self._content_to_text(content)

    def _extract_conversation_text(self, response: Any) -> str:
        outputs = getattr(response, "outputs", None)
        if isinstance(response, dict):
            outputs = response.get("outputs")
        if not isinstance(outputs, list):
            return ""

        chunks: list[str] = []
        for output in outputs:
            output_type = self._get_field(output, "type")
            if output_type and output_type != "message.output":
                continue
            text = self._content_to_text(self._get_field(output, "content"))
            if text:
                chunks.append(text)
        return "\n".join(chunks).strip()

    def _content_to_text(self, content: Any) -> str:
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            pieces: list[str] = []
            for chunk in content:
                text = self._get_field(chunk, "text")
                if isinstance(text, str) and text.strip():
                    pieces.append(text.strip())
            return "\n".join(pieces).strip()
        text = self._get_field(content, "text")
        if isinstance(text, str):
            return text.strip()
        return ""

    def _error_message(self, exc: Exception) -> str:
        raw = str(exc).strip()
        message = raw if raw else exc.__class__.__name__
        status_code = self._get_field(exc, "status_code")
        error_code = self._get_field(exc, "code")
        parts = [message]
        if status_code is not None:
            parts.append(f"status={status_code}")
        if error_code is not None:
            parts.append(f"code={error_code}")
        return " | ".join(parts)

    def _conversation_id(self, response: Any) -> str | None:
        conversation_id = self._get_field(response, "conversation_id")
        if conversation_id:
            return str(conversation_id)
        return None

    def _agent_id(self, agent: Any) -> str:
        if isinstance(agent, dict):
            return str(agent.get("id", ""))
        return str(getattr(agent, "id", ""))

    def _get_field(self, value: Any, key: str) -> Any:
        if isinstance(value, dict):
            return value.get(key)
        return getattr(value, key, None)

    def _eda_prompt(self, user_prompt: str, dataset_context: str) -> str:
        ctx = f" Dataset context: {dataset_context}." if dataset_context else ""
        return (
            "Perform exploratory data analysis for this anomaly detection task. "
            f"User intent: {user_prompt}.{ctx} "
            "The dataset file is attached via code_interpreter — load it with "
            "pandas from the sandbox working directory. "
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

    def _code_prompt(self, eda_data: dict[str, Any], algorithm_data: dict[str, Any], dataset_context: str) -> str:
        ctx = f" Dataset context: {dataset_context}." if dataset_context else ""
        return (
            "Generate production-ready Python anomaly detection code. "
            f"The dataset file is attached via code_interpreter — load it from the sandbox.{ctx} "
            f"EDA JSON: {json.dumps(eda_data)}. "
            f"Algorithm JSON: {json.dumps(algorithm_data)}. "
            "Return executable Python code only."
        )

    def _validation_prompt(self, code_output: str, dataset_context: str) -> str:
        ctx = f" Dataset context: {dataset_context}." if dataset_context else ""
        return (
            "Validate anomaly detection outputs statistically. "
            f"The dataset file is attached via code_interpreter — load it from the sandbox.{ctx} "
            f"Generated code: {code_output[:8000]}. "
            "Return strict JSON with keys: metrics, diagnostics, confidence, caveats, recommendation."
        )
