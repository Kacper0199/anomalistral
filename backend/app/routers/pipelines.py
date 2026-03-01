import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from mistralai import Mistral
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.dag_executor import DAGExecutor
from app.agents.registry import AgentRegistry
from app.db.session import AsyncSessionLocal
from app.deps import get_db, get_mistral_client
from app.models.database import Session
from app.routers.dag import _get_registry, _load_dag_from_db, _running_executors
from app.services.streaming import stream_manager

router = APIRouter(prefix="/pipelines", tags=["pipelines"])
logger = logging.getLogger(__name__)


@router.post("/{session_id}/start")
async def start_pipeline(
    session_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    client: Mistral = Depends(get_mistral_client),
) -> dict[str, str]:
    session = await db.scalar(select(Session).where(Session.id == session_id))
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session_id in _running_executors:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Pipeline already running")

    registry = _get_registry(client)

    async def _run() -> None:
        async with AsyncSessionLocal() as bg_db:
            executor = DAGExecutor(
                session_id=session_id,
                mistral_client=client,
                agent_registry=registry,
                db=bg_db,
                stream_manager=stream_manager,
            )
            _running_executors[session_id] = executor
            try:
                dag = await _load_dag_from_db(bg_db, session_id)
                await executor.execute_dag(dag)
            except Exception:
                logger.exception("Pipeline execution failed", extra={"session_id": session_id})
            finally:
                _running_executors.pop(session_id, None)

    background_tasks.add_task(_run)
    return {"status": "started", "session_id": session_id}
