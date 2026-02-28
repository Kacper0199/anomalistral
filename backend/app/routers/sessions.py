import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.deps import get_db
from app.models.database import Event, Session
from app.models.schemas import DAGUpdate, SessionCommand, SessionCreate, SessionResponse

router = APIRouter(prefix="/sessions", tags=["sessions"])


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
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    session = await _get_session_or_404(db, session_id)

    if command.command == "cancel":
        session.status = "failed"
    if command.command == "modify" and command.payload is not None and "user_prompt" in command.payload:
        session.user_prompt = str(command.payload["user_prompt"])

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
