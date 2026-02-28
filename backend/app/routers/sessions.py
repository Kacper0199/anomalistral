import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from mistralai import Mistral
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.session import AsyncSessionLocal
from app.deps import get_db, get_mistral_client
from app.models.database import Event, Session
from app.models.schemas import DAGUpdate, SSEEvent, SessionCommand, SessionCreate, SessionResponse
from app.services.streaming import StreamManager, stream_manager

router = APIRouter(prefix="/sessions", tags=["sessions"])


def get_stream_manager() -> StreamManager:
    return stream_manager


def _parse_json(value: str | None) -> dict[str, Any] | None:
    if value is None:
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {"raw": value}
    if isinstance(parsed, dict):
        return parsed
    return {"data": parsed}


def _to_response(session: Session) -> SessionResponse:
    return SessionResponse(
        id=session.id,
        status=session.status,
        user_prompt=session.user_prompt,
        dataset_filename=session.dataset_filename,
        created_at=session.created_at,
        eda_results=_parse_json(session.eda_results),
        algorithm_recommendations=_parse_json(session.algorithm_recommendations),
        generated_code=session.generated_code,
        validation_results=_parse_json(session.validation_results),
        dag_config=_parse_json(session.dag_config),
    )


async def _get_session_or_404(db: AsyncSession, session_id: str) -> Session:
    result = await db.scalar(select(Session).where(Session.id == session_id))
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return result


async def _next_seq(db: AsyncSession, session_id: str) -> int:
    max_seq = await db.scalar(select(func.max(Event.seq)).where(Event.session_id == session_id))
    return int(max_seq or 0) + 1


def _get_field(value: Any, key: str) -> Any:
    if isinstance(value, dict):
        return value.get(key)
    return getattr(value, key, None)


def _content_to_text(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        pieces: list[str] = []
        for item in content:
            text = _get_field(item, "text")
            if isinstance(text, str) and text.strip():
                pieces.append(text.strip())
        return "\n".join(pieces).strip()
    text = _get_field(content, "text")
    if isinstance(text, str):
        return text.strip()
    return ""


def _extract_conversation_text(response: Any) -> str:
    outputs = _get_field(response, "outputs")
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


async def _publish_chat_response(
    session_id: str,
    text: str,
    db: AsyncSession,
    stream: StreamManager,
) -> None:
    seq = await _next_seq(db, session_id)
    payload = {"text": text, "agent": "orchestrator"}
    event = SSEEvent(
        session_id=session_id,
        seq=seq,
        ts=datetime.now(UTC).isoformat(),
        type="chat.response",
        payload=payload,
    )
    await stream.publish(session_id, event)
    db.add(
        Event(
            session_id=session_id,
            seq=seq,
            event_type="chat.response",
            payload=json.dumps(payload),
        )
    )
    await db.commit()


async def _run_chat_command(
    session_id: str,
    conversation_id: str,
    message: str,
    client: Mistral,
    stream: StreamManager,
) -> None:
    async with AsyncSessionLocal() as db:
        try:
            response = await asyncio.to_thread(
                client.beta.conversations.append,
                conversation_id=conversation_id,
                inputs=message,
            )
            text = _extract_conversation_text(response)
            await _publish_chat_response(session_id=session_id, text=text, db=db, stream=stream)
        except Exception:
            await _publish_chat_response(
                session_id=session_id,
                text="I'm having trouble processing your message. Please try again in a moment.",
                db=db,
                stream=stream,
            )


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(payload: SessionCreate, db: AsyncSession = Depends(get_db)) -> SessionResponse:
    session = Session(user_prompt=payload.user_prompt, status="created")
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return _to_response(session)


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str, db: AsyncSession = Depends(get_db)) -> SessionResponse:
    session = await _get_session_or_404(db, session_id)
    return _to_response(session)


@router.post("/{session_id}/command", response_model=SessionResponse)
async def send_command(
    session_id: str,
    command: SessionCommand,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    client: Mistral = Depends(get_mistral_client),
    stream: StreamManager = Depends(get_stream_manager),
) -> SessionResponse:
    session = await _get_session_or_404(db, session_id)

    if command.command == "cancel":
        session.status = "failed"
    if command.command == "modify" and command.payload is not None:
        if "user_prompt" in command.payload:
            session.user_prompt = str(command.payload["user_prompt"])
        if "dataset_path" in command.payload:
            session.dataset_path = str(command.payload["dataset_path"])
        if "dataset_filename" in command.payload:
            session.dataset_filename = str(command.payload["dataset_filename"])
    if command.command == "chat":
        payload = command.payload or {}
        message_value = payload.get("message")
        if not isinstance(message_value, str) or not message_value.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Chat command requires payload.message")
        conversation_id = session.conversation_id
        if conversation_id is not None and conversation_id.strip():
            background_tasks.add_task(
                _run_chat_command,
                session_id,
                conversation_id,
                message_value.strip(),
                client,
                stream,
            )

    event = Event(
        session_id=session_id,
        seq=await _next_seq(db, session_id),
        event_type=f"command.{command.command}",
        payload=json.dumps(command.payload or {}),
    )
    db.add(event)
    await db.commit()
    await db.refresh(session)
    return _to_response(session)


@router.put("/{session_id}/dag", response_model=SessionResponse)
async def update_dag(
    session_id: str,
    payload: DAGUpdate,
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    session = await _get_session_or_404(db, session_id)
    session.dag_config = json.dumps(payload.dag_config)
    await db.commit()
    await db.refresh(session)
    return _to_response(session)


@router.get("/{session_id}/artifacts")
async def list_artifacts(session_id: str) -> dict[str, Any]:
    settings = get_settings()
    session_dir = Path(settings.ARTIFACT_DIR) / session_id
    if not session_dir.exists() or not session_dir.is_dir():
        return {"session_id": session_id, "artifacts": []}

    artifacts: list[dict[str, Any]] = []
    for item in sorted(session_dir.iterdir(), key=lambda entry: entry.name):
        if item.is_file():
            artifacts.append(
                {
                    "name": item.name,
                    "path": str(item),
                    "size": item.stat().st_size,
                }
            )

    return {"session_id": session_id, "artifacts": artifacts}
