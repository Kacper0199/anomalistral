import asyncio

from fastapi import APIRouter, Depends, HTTPException, status
from mistralai import Mistral
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.executor import PipelineExecutor
from app.agents.registry import AgentRegistry
from app.db.session import AsyncSessionLocal
from app.deps import get_db, get_mistral_client
from app.models.database import Session
from app.services.streaming import stream_manager

router = APIRouter(prefix="/pipelines", tags=["pipelines"])

_registry: AgentRegistry | None = None


def _get_registry(client: Mistral) -> AgentRegistry:
    global _registry
    if _registry is None:
        _registry = AgentRegistry(client)
    return _registry


@router.post("/{session_id}/start")
async def start_pipeline(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    client: Mistral = Depends(get_mistral_client),
) -> dict[str, str]:
    session = await db.scalar(select(Session).where(Session.id == session_id))
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.status in {"eda_running", "algorithm_running", "codegen_running", "validation_running"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Pipeline already running")

    user_prompt = session.user_prompt
    dataset_path = session.dataset_path
    session.status = "eda_running"
    await db.commit()

    registry = _get_registry(client)

    async def run_pipeline() -> None:
        async with AsyncSessionLocal() as background_db:
            executor = PipelineExecutor(
                session_id=session_id,
                mistral_client=client,
                agent_registry=registry,
                db=background_db,
                stream_manager=stream_manager,
            )
            await executor.execute(user_prompt=user_prompt, dataset_path=dataset_path)

    asyncio.create_task(run_pipeline())
    return {"status": "started", "session_id": session_id}
