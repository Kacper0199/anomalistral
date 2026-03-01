import asyncio
import json
import math
from collections import deque
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pandas as pd
from mistralai import Mistral
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.registry import AgentRegistry
from app.config import get_settings
from app.models.database import Event, Session, SessionBlock
from app.models.schemas import DAGDefinition, DAGNode, SSEEvent
from app.services.retry import retry_sync
from app.services.streaming import StreamManager

MAX_DATASET_CONTEXT_ROWS = 5
MAX_DATASET_CONTEXT_COLS = 40

_TYPE_COMPAT: dict[str, dict[str, list[str]]] = {
    "upload": {"inputs": [], "outputs": ["dataframe"]},
    "eda": {"inputs": ["dataframe"], "outputs": ["eda_report"]},
    "normalization": {"inputs": ["dataframe"], "outputs": ["dataframe"]},
    "imputation": {"inputs": ["dataframe"], "outputs": ["dataframe"]},
    "algorithm": {"inputs": ["dataframe", "eda_report"], "outputs": ["anomaly_scores"]},
    "aggregator": {"inputs": ["anomaly_scores"], "outputs": ["anomaly_scores"]},
    "anomaly_viz": {"inputs": ["anomaly_scores", "dataframe"], "outputs": []},
}


def _sanitize_for_json(obj: Any) -> Any:
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: _sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_for_json(item) for item in obj]
    return obj


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


def _extract_conversation_text(response: Any) -> str:
    outputs = getattr(response, "outputs", None)
    if isinstance(response, dict):
        outputs = response.get("outputs")
    if not isinstance(outputs, list):
        return ""
    chunks: list[str] = []
    for output in outputs:
        output_type = _get_field(output, "type")
        if output_type and output_type != "message.output":
            continue
        text = _content_to_text(_get_field(output, "content"))
        if text:
            chunks.append(text)
    return "\n".join(chunks).strip()


def _content_to_text(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        pieces: list[str] = []
        for chunk in content:
            text = _get_field(chunk, "text")
            if isinstance(text, str) and text.strip():
                pieces.append(text.strip())
        return "\n".join(pieces).strip()
    text = _get_field(content, "text")
    if isinstance(text, str):
        return text.strip()
    return ""


def _get_field(value: Any, key: str) -> Any:
    if isinstance(value, dict):
        return value.get(key)
    return getattr(value, key, None)


def _parse_json(text: str) -> Any:
    raw = text.strip()
    if not raw:
        return {}
    stripped = raw
    if stripped.startswith("```"):
        first_nl = stripped.find("\n")
        if first_nl != -1:
            stripped = stripped[first_nl + 1:]
        stripped = stripped.rstrip("`").strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass
    for open_ch, close_ch in [("{", "}"), ("[", "]")]:
        start = stripped.find(open_ch)
        end = stripped.rfind(close_ch)
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(stripped[start: end + 1])
            except json.JSONDecodeError:
                continue
    return {"raw": raw}


def _to_structured_payload(text: str) -> dict[str, Any]:
    parsed = _parse_json(text)
    if isinstance(parsed, dict):
        return parsed
    if isinstance(parsed, list):
        return {"items": parsed}
    return {"raw": text}


class DAGExecutor:
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
        self._cancelled = False
        self._paused = False
        self._pause_event = asyncio.Event()
        self._pause_event.set()

    async def validate_dag(self, dag: DAGDefinition) -> list[str]:
        errors: list[str] = []
        node_ids = {n.id for n in dag.nodes}
        node_map = {n.id: n for n in dag.nodes}

        for edge in dag.edges:
            if edge.source not in node_ids:
                errors.append(f"Edge {edge.id}: source node '{edge.source}' does not exist")
            if edge.target not in node_ids:
                errors.append(f"Edge {edge.id}: target node '{edge.target}' does not exist")

        for edge in dag.edges:
            if edge.source not in node_ids or edge.target not in node_ids:
                continue
            src = node_map[edge.source]
            tgt = node_map[edge.target]
            src_type = src.block_type.value
            tgt_type = tgt.block_type.value
            src_outputs = set(_TYPE_COMPAT.get(src_type, {}).get("outputs", []))
            tgt_inputs = set(_TYPE_COMPAT.get(tgt_type, {}).get("inputs", []))
            if src_outputs and tgt_inputs and not src_outputs.intersection(tgt_inputs):
                errors.append(
                    f"Type mismatch: '{src_type}' outputs {list(src_outputs)} "
                    f"incompatible with '{tgt_type}' inputs {list(tgt_inputs)}"
                )

        adj: dict[str, list[str]] = {n.id: [] for n in dag.nodes}
        for edge in dag.edges:
            if edge.source in adj:
                adj[edge.source].append(edge.target)

        visited: set[str] = set()
        rec_stack: set[str] = set()

        def has_cycle(node_id: str) -> bool:
            visited.add(node_id)
            rec_stack.add(node_id)
            for neighbor in adj.get(node_id, []):
                if neighbor not in visited:
                    if has_cycle(neighbor):
                        return True
                elif neighbor in rec_stack:
                    return True
            rec_stack.discard(node_id)
            return False

        for nid in node_ids:
            if nid not in visited:
                if has_cycle(nid):
                    errors.append("DAG contains a cycle")
                    break

        return errors

    async def topological_sort(self, dag: DAGDefinition) -> list[list[str]]:
        in_degree: dict[str, int] = {n.id: 0 for n in dag.nodes}
        adj: dict[str, list[str]] = {n.id: [] for n in dag.nodes}

        for edge in dag.edges:
            if edge.source in adj and edge.target in in_degree:
                adj[edge.source].append(edge.target)
                in_degree[edge.target] += 1

        queue: deque[str] = deque(nid for nid, deg in in_degree.items() if deg == 0)
        layers: list[list[str]] = []

        while queue:
            layer_size = len(queue)
            layer: list[str] = []
            for _ in range(layer_size):
                nid = queue.popleft()
                layer.append(nid)
                for neighbor in adj.get(nid, []):
                    in_degree[neighbor] -= 1
                    if in_degree[neighbor] == 0:
                        queue.append(neighbor)
            layers.append(layer)

        return layers

    async def execute_dag(self, dag: DAGDefinition, from_block_id: str | None = None) -> None:
        layers = await self.topological_sort(dag)
        node_map = {n.id: n for n in dag.nodes}
        block_results: dict[str, dict[str, Any]] = {}

        start_layer_idx = 0
        if from_block_id is not None:
            for idx, layer in enumerate(layers):
                if from_block_id in layer:
                    start_layer_idx = idx
                    break

        await self._publish("pipeline.started", {"session_id": self.session_id, "total_layers": len(layers)})

        try:
            for layer_idx, layer in enumerate(layers):
                if self._cancelled:
                    break
                if layer_idx < start_layer_idx:
                    continue
                await self._pause_event.wait()
                if self._cancelled:
                    break

                block_tasks: list[tuple[str, asyncio.Task[dict[str, Any]]]] = []
                for i, block_id in enumerate(layer):
                    if i > 0:
                        await asyncio.sleep(0.2)
                    if block_id not in node_map:
                        continue
                    node = node_map[block_id]
                    upstream = self._collect_upstream(block_id, dag, block_results)
                    task = asyncio.create_task(self._execute_block_safe(node, upstream))
                    block_tasks.append((block_id, task))

                for block_id, task in block_tasks:
                    try:
                        result = await task
                        block_results[block_id] = result
                    except Exception as exc:
                        block_results[block_id] = {"error": str(exc)}

            if self._cancelled:
                await self._publish("pipeline.cancelled", {"session_id": self.session_id})
            else:
                await self._publish("pipeline.completed", {"session_id": self.session_id, "status": "completed"})
        except Exception as exc:
            await self._publish("pipeline.failed", {"session_id": self.session_id, "error": str(exc)})
            raise

    def _collect_upstream(
        self, block_id: str, dag: DAGDefinition, block_results: dict[str, dict[str, Any]]
    ) -> dict[str, Any]:
        upstream: dict[str, Any] = {}
        for edge in dag.edges:
            if edge.target == block_id and edge.source in block_results:
                upstream[edge.source] = block_results[edge.source]
        return upstream

    async def _execute_block_safe(self, node: DAGNode, upstream_results: dict[str, Any]) -> dict[str, Any]:
        await self._update_block_status(node.id, "running")
        await self._publish("block.started", {"block_id": node.id, "block_type": node.block_type.value})
        try:
            result = await self.execute_block(node, upstream_results)
            await self._update_block_status(node.id, "success", result=result)
            await self._publish("block.completed", {
                "block_id": node.id,
                "block_type": node.block_type.value,
                "result": _sanitize_for_json(result),
            })
            return result
        except Exception as exc:
            await self._update_block_status(node.id, "error", error=str(exc))
            await self._publish("block.failed", {
                "block_id": node.id,
                "block_type": node.block_type.value,
                "error": str(exc),
            })
            raise

    async def execute_block(self, block_node: DAGNode, upstream_results: dict[str, Any]) -> dict[str, Any]:
        block_type = block_node.block_type.value
        config = block_node.config.model_dump() if block_node.config else {}
        session = await self._get_session()

        if block_type == "upload":
            return {"dataset_path": session.dataset_path, "filename": session.dataset_filename, "upload_cols": config.get("columns", [])}

        if block_type == "eda":
            upload_cols = self._find_upstream_type(upstream_results, "upload_cols") or []
            return await self._execute_agent_block(
                block_node=block_node,
                agent_type="eda",
                prompt=self._eda_prompt(session.user_prompt or "", session, upload_cols),
                use_file=True,
                session=session,
            )

        if block_type == "normalization":
            return await self._execute_normalization(block_node, config, upstream_results, session)

        if block_type == "imputation":
            return await self._execute_imputation(block_node, config, upstream_results, session)

        if block_type == "algorithm":
            eda_data = self._find_upstream_type(upstream_results, "eda_report")
            upload_cols = self._find_upstream_type(upstream_results, "upload_cols") or []
            return await self._execute_agent_block(
                block_node=block_node,
                agent_type="algorithm",
                prompt=self._algorithm_prompt(eda_data, config, upload_cols),
                use_file=True,
                session=session,
            )

        if block_type == "aggregator":
            return await self._execute_aggregator(block_node, config, upstream_results)

        if block_type == "anomaly_viz":
            scores = self._find_upstream_type(upstream_results, "anomaly_scores")
            return {"visualization_ready": True, "anomaly_scores": scores}

        raise ValueError(f"Unknown block type: {block_type}")

    def _find_upstream_type(self, upstream_results: dict[str, Any], key: str) -> Any:
        for result in upstream_results.values():
            if isinstance(result, dict) and key in result:
                return result[key]
            if isinstance(result, dict):
                for v in result.values():
                    if isinstance(v, dict) and key in v:
                        return v[key]
        return {}

    async def _execute_agent_block(
        self,
        block_node: DAGNode,
        agent_type: str,
        prompt: str,
        use_file: bool,
        session: Any,
    ) -> dict[str, Any]:
        config = block_node.config.model_dump() if block_node.config else {}
        prompt_override = config.get("prompt_override")

        db_block = await self.db.scalar(
            select(SessionBlock).where(SessionBlock.id == block_node.id)
        )

        agent_id: str | None = db_block.agent_id if db_block else None
        if not agent_id:
            agent = await self.registry.get_or_create_agent(
                block_type=agent_type,
                block_id=block_node.id,
                prompt_override=prompt_override,
            )
            agent_id = str(_get_field(agent, "id") or "")
            if db_block and agent_id:
                db_block.agent_id = agent_id
                await self.db.commit()

        file_id: str | None = None
        if use_file and session.dataset_path:
            file_id = session.mistral_file_id
            if not file_id:
                file_id = await asyncio.to_thread(_upload_file_to_mistral, self.client, session.dataset_path)
                if file_id:
                    session.mistral_file_id = file_id
                    await self.db.commit()

        inputs = _build_inputs_with_file(prompt, file_id)
        raw_response = await asyncio.to_thread(
            retry_sync,
            self.client.beta.conversations.start,
            agent_id=agent_id,
            inputs=inputs,
            timeout_ms=90_000,
        )
        text = _extract_conversation_text(raw_response)
        structured = _sanitize_for_json(_to_structured_payload(text))
        return structured

    async def _execute_normalization(
        self,
        block: DAGNode,
        config: dict[str, Any],
        upstream_data: dict[str, Any],
        session: Any,
    ) -> dict[str, Any]:
        method = config.get("method", "min_max")
        dataset_path = session.dataset_path
        if not dataset_path:
            return {"method": method, "applied": False, "columns_processed": []}

        try:
            path = Path(dataset_path)
            df = pd.read_csv(path) if path.suffix.lower() == ".csv" else pd.read_json(path)
            cfg_cols = config.get("columns", [])
            if cfg_cols:
                numeric_cols = [c for c in cfg_cols if c in df.columns]
            else:
                numeric_cols = df.select_dtypes(include="number").columns.tolist()

            if method == "standard_scaler":
                for col in numeric_cols:
                    df[col] = (df[col] - df[col].mean()) / (df[col].std() + 1e-8)
            elif method == "min_max":
                for col in numeric_cols:
                    col_min = df[col].min()
                    col_max = df[col].max()
                    if col_max != col_min:
                        df[col] = (df[col] - col_min) / (col_max - col_min)
            elif method == "standardize":
                for col in numeric_cols:
                    df[col] = (df[col] - df[col].mean()) / (df[col].std() + 1e-8)
            elif method == "robust":
                for col in numeric_cols:
                    median = df[col].median()
                    iqr = df[col].quantile(0.75) - df[col].quantile(0.25)
                    df[col] = (df[col] - median) / (iqr + 1e-8)

            return {"method": method, "applied": True, "columns_processed": numeric_cols}
        except Exception as exc:
            return {"method": method, "applied": False, "error": str(exc), "columns_processed": []}

    async def _execute_imputation(
        self,
        block: DAGNode,
        config: dict[str, Any],
        upstream_data: dict[str, Any],
        session: Any,
    ) -> dict[str, Any]:
        method = config.get("method", "median")
        dataset_path = session.dataset_path
        if not dataset_path:
            return {"method": method, "applied": False, "rows_affected": 0}

        try:
            path = Path(dataset_path)
            df = pd.read_csv(path) if path.suffix.lower() == ".csv" else pd.read_json(path)
            rows_before = df.isnull().any(axis=1).sum()

            cfg_cols = config.get("columns", [])
            if cfg_cols:
                imp_cols = [c for c in cfg_cols if c in df.columns]
            else:
                imp_cols = df.select_dtypes(include="number").columns.tolist()

            if method == "median":
                for col in imp_cols:
                    df[col] = df[col].fillna(df[col].median())
            elif method == "mean":
                for col in imp_cols:
                    df[col] = df[col].fillna(df[col].mean())
            elif method == "mode":
                for col in df.columns:
                    mode_vals = df[col].mode()
                    if not mode_vals.empty:
                        df[col] = df[col].fillna(mode_vals[0])
            elif method == "forward_fill":
                df = df.ffill()

            rows_after = df.isnull().any(axis=1).sum()
            return {"method": method, "applied": True, "rows_affected": int(rows_before - rows_after)}
        except Exception as exc:
            return {"method": method, "applied": False, "error": str(exc), "rows_affected": 0}

    async def _execute_aggregator(
        self,
        block: DAGNode,
        config: dict[str, Any],
        upstream_results: dict[str, Any],
    ) -> dict[str, Any]:
        method = config.get("method", "majority_vote")
        weights: dict[str, float] = config.get("weights") or {}

        score_sets: list[tuple[str, list[Any]]] = []
        for source_id, result in upstream_results.items():
            if isinstance(result, dict):
                scores = result.get("anomaly_scores") or result.get("items") or []
                if scores:
                    score_sets.append((source_id, scores if isinstance(scores, list) else [scores]))

        if not score_sets:
            return {"method": method, "aggregated_scores": [], "source_count": 0}

        min_len = min(len(s) for _, s in score_sets)
        aggregated: list[Any] = []

        if method == "majority_vote":
            for i in range(min_len):
                votes = sum(1 for _, s in score_sets if s[i] and float(s[i]) > 0.5)
                aggregated.append(1 if votes > len(score_sets) / 2 else 0)
        elif method == "weighted_average":
            total_weight = sum(weights.get(sid, 1.0) for sid, _ in score_sets)
            for i in range(min_len):
                weighted_sum = sum(
                    weights.get(sid, 1.0) * float(s[i]) for sid, s in score_sets
                )
                aggregated.append(weighted_sum / total_weight if total_weight > 0 else 0.0)

        return {"method": method, "aggregated_scores": aggregated, "source_count": len(score_sets)}

    def stop(self) -> None:
        self._cancelled = True
        self._pause_event.set()

    def pause(self) -> None:
        self._paused = True
        self._pause_event.clear()

    def resume(self) -> None:
        self._paused = False
        self._pause_event.set()

    async def _publish(self, event_type: str, payload: dict[str, Any]) -> None:
        if self.seq == 0:
            max_seq = await self.db.scalar(
                select(func.max(Event.seq)).where(Event.session_id == self.session_id)
            )
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

    async def _update_block_status(
        self,
        block_id: str,
        status: str,
        result: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> None:
        db_block = await self.db.scalar(select(SessionBlock).where(SessionBlock.id == block_id))
        if db_block:
            db_block.status = status
            if result is not None:
                db_block.result = json.dumps(result)
            if error is not None:
                db_block.error_message = error
            await self.db.commit()

        await self._publish(
            "block.status",
            {"block_id": block_id, "status": status, "error": error},
        )

    async def _get_session(self) -> Session:
        session = await self.db.scalar(select(Session).where(Session.id == self.session_id))
        if session is None:
            raise RuntimeError(f"Session {self.session_id} not found")
        return session

    def _eda_prompt(self, user_prompt: str, session: Any, upload_cols: list[str] | None = None) -> str:
        prompt = (
            "Perform exploratory data analysis for this anomaly detection task. "
            f"User intent: {user_prompt}. "
            "The dataset file is attached via code_interpreter — load it with pandas from the sandbox. "
            "Return strict JSON with keys: row_count, column_count, summary, frequency, missing_values, "
            "trend, seasonality, stationarity, statistics, column_types, data_quality_flags, notes."
        )
        if upload_cols:
            prompt += f" Please restrict your analysis strictly to these columns: {', '.join(upload_cols)}."
        return prompt

    def _algorithm_prompt(self, eda_data: Any, config: dict, upload_cols: list[str] | None = None) -> str:
        eda_json = json.dumps(eda_data) if isinstance(eda_data, dict) else str(eda_data)
        prompt = (
            "You are a Data Scientist. Write and execute Python code using the code_interpreter tool to detect anomalies in the uploaded dataset. "
            "You must output a strict JSON object with two keys: 'code' (the exact Python code you executed) and 'anomaly_scores' "
            f"(a list of 1s and 0s, where 1 is anomaly, matching the row count). EDA context: {eda_json}."
        )
        if upload_cols:
            prompt += f" Ensure your model ONLY uses these columns as features: {', '.join(upload_cols)}."
        if config.get("prompt_override"):
            prompt += f" User instructions: {config['prompt_override']}"
        return prompt
