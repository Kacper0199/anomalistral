import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from mistralai import Mistral
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.dag_executor import DAGExecutor
from app.agents.registry import AgentRegistry
from app.db.session import AsyncSessionLocal
from app.deps import get_db, get_mistral_client
from app.models.database import BlockMessage, PipelineTemplate, Session, SessionBlock, SessionEdge
from app.models.schemas import (
    AddBlockRequest,
    AddEdgeRequest,
    BlockChatRequest,
    BlockConfigUpdate,
    BlockResponse,
    BlockStatus,
    DAGDefinition,
    DAGEdge,
    DAGNode,
    DAGUpdateRequest,
    NodePosition,
    PipelineAction,
    PipelineControlRequest,
    SessionBlockMessage,
)
from app.services.streaming import stream_manager

router = APIRouter(prefix="/sessions/{session_id}", tags=["dag"])
logger = logging.getLogger(__name__)

_running_executors: dict[str, DAGExecutor] = {}
_registry: AgentRegistry | None = None


def _get_registry(client: Mistral) -> AgentRegistry:
    global _registry
    if _registry is None:
        _registry = AgentRegistry(client)
    return _registry


def _block_to_node(block: SessionBlock) -> DAGNode:
    config_data: Any = None
    if block.config:
        try:
            config_data = json.loads(block.config)
        except json.JSONDecodeError:
            config_data = None

    from app.models.schemas import BlockConfig, BlockType

    return DAGNode(
        id=block.id,
        block_type=BlockType(block.block_type_id),
        position=NodePosition(x=block.position_x, y=block.position_y),
        config=BlockConfig(**config_data) if isinstance(config_data, dict) else None,
        status=BlockStatus(block.status),
    )


def _edge_to_schema(edge: SessionEdge) -> DAGEdge:
    return DAGEdge(
        id=edge.id,
        source=edge.source_block_id,
        target=edge.target_block_id,
        source_handle=edge.source_handle,
        target_handle=edge.target_handle,
    )


def _block_to_response(block: SessionBlock) -> BlockResponse:
    result_data: dict[str, Any] | None = None
    if block.result:
        try:
            result_data = json.loads(block.result)
        except json.JSONDecodeError:
            result_data = None

    config_data: Any = None
    if block.config:
        try:
            config_data = json.loads(block.config)
        except json.JSONDecodeError:
            config_data = None

    from app.models.schemas import BlockConfig

    return BlockResponse(
        id=block.id,
        block_type=block.block_type_id,
        position=NodePosition(x=block.position_x, y=block.position_y),
        config=BlockConfig(**config_data) if isinstance(config_data, dict) else None,
        status=BlockStatus(block.status),
        result=result_data,
        error_message=block.error_message,
    )


async def _get_session_or_404(db: AsyncSession, session_id: str) -> Session:
    session = await db.scalar(select(Session).where(Session.id == session_id))
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


async def _load_dag_from_db(db: AsyncSession, session_id: str) -> DAGDefinition:
    blocks_result = await db.execute(select(SessionBlock).where(SessionBlock.session_id == session_id))
    blocks = blocks_result.scalars().all()

    edges_result = await db.execute(select(SessionEdge).where(SessionEdge.session_id == session_id))
    edges = edges_result.scalars().all()

    return DAGDefinition(
        nodes=[_block_to_node(b) for b in blocks],
        edges=[_edge_to_schema(e) for e in edges],
    )


@router.get("/dag", response_model=DAGDefinition)
async def get_dag(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> DAGDefinition:
    await _get_session_or_404(db, session_id)
    return await _load_dag_from_db(db, session_id)


@router.put("/dag", response_model=DAGDefinition)
async def save_dag(
    session_id: str,
    body: DAGUpdateRequest,
    db: AsyncSession = Depends(get_db),
) -> DAGDefinition:
    await _get_session_or_404(db, session_id)
    await db.execute(delete(SessionEdge).where(SessionEdge.session_id == session_id))
    await db.execute(delete(SessionBlock).where(SessionBlock.session_id == session_id))
    await db.flush()

    for node in body.dag.nodes:
        config_str = json.dumps(node.config.model_dump()) if node.config else None
        block = SessionBlock(
            id=node.id,
            session_id=session_id,
            block_type_id=node.block_type.value,
            position_x=node.position.x,
            position_y=node.position.y,
            config=config_str,
            status=node.status.value,
        )
        db.add(block)

    await db.flush()

    for edge in body.dag.edges:
        db_edge = SessionEdge(
            id=edge.id,
            session_id=session_id,
            source_block_id=edge.source,
            target_block_id=edge.target,
            source_handle=edge.source_handle,
            target_handle=edge.target_handle,
        )
        db.add(db_edge)

    await db.commit()
    return await _load_dag_from_db(db, session_id)


@router.post("/dag/validate")
async def validate_dag(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    client: Mistral = Depends(get_mistral_client),
) -> dict[str, Any]:
    await _get_session_or_404(db, session_id)
    dag = await _load_dag_from_db(db, session_id)
    registry = _get_registry(client)
    executor = DAGExecutor(
        session_id=session_id,
        mistral_client=client,
        agent_registry=registry,
        db=db,
        stream_manager=stream_manager,
    )
    errors = await executor.validate_dag(dag)
    return {"valid": len(errors) == 0, "errors": errors}


@router.post("/blocks", response_model=BlockResponse, status_code=status.HTTP_201_CREATED)
async def add_block(
    session_id: str,
    body: AddBlockRequest,
    db: AsyncSession = Depends(get_db),
) -> BlockResponse:
    await _get_session_or_404(db, session_id)
    config_str = json.dumps(body.config.model_dump()) if body.config else None
    block = SessionBlock(
        session_id=session_id,
        block_type_id=body.block_type.value,
        position_x=body.position.x,
        position_y=body.position.y,
        config=config_str,
        status="idle",
    )
    db.add(block)
    await db.commit()
    await db.refresh(block)
    return _block_to_response(block)


@router.put("/blocks/{block_id}", response_model=BlockResponse)
async def update_block(
    session_id: str,
    block_id: str,
    body: BlockConfigUpdate,
    db: AsyncSession = Depends(get_db),
) -> BlockResponse:
    block = await db.scalar(
        select(SessionBlock).where(
            SessionBlock.id == block_id,
            SessionBlock.session_id == session_id,
        )
    )
    if block is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found")
    block.config = json.dumps(body.config.model_dump())
    await db.commit()
    await db.refresh(block)
    return _block_to_response(block)


@router.delete("/blocks/{block_id}")
async def delete_block(
    session_id: str,
    block_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    block = await db.scalar(
        select(SessionBlock).where(
            SessionBlock.id == block_id,
            SessionBlock.session_id == session_id,
        )
    )
    if block is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found")
    await db.delete(block)
    await db.commit()
    return {"deleted": True}


@router.post("/edges", status_code=status.HTTP_201_CREATED)
async def add_edge(
    session_id: str,
    body: AddEdgeRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await _get_session_or_404(db, session_id)
    edge = SessionEdge(
        session_id=session_id,
        source_block_id=body.source,
        target_block_id=body.target,
        source_handle=body.source_handle,
        target_handle=body.target_handle,
    )
    db.add(edge)
    await db.commit()
    await db.refresh(edge)
    return {
        "id": edge.id,
        "source": edge.source_block_id,
        "target": edge.target_block_id,
        "source_handle": edge.source_handle,
        "target_handle": edge.target_handle,
    }


@router.delete("/edges/{edge_id}")
async def delete_edge(
    session_id: str,
    edge_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    edge = await db.scalar(
        select(SessionEdge).where(
            SessionEdge.id == edge_id,
            SessionEdge.session_id == session_id,
        )
    )
    if edge is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Edge not found")
    await db.delete(edge)
    await db.commit()
    return {"deleted": True}


@router.post("/pipeline/control")
async def control_pipeline(
    session_id: str,
    body: PipelineControlRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    client: Mistral = Depends(get_mistral_client),
) -> dict[str, str]:
    await _get_session_or_404(db, session_id)

    if body.action in (PipelineAction.STOP,):
        executor = _running_executors.get(session_id)
        if executor:
            executor.stop()
            _running_executors.pop(session_id, None)
        return {"status": "accepted", "action": body.action.value}

    if body.action == PipelineAction.PAUSE:
        executor = _running_executors.get(session_id)
        if executor:
            executor.pause()
        return {"status": "accepted", "action": body.action.value}

    registry = _get_registry(client)

    async def _run(from_block_id: str | None = None) -> None:
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
                await executor.execute_dag(dag, from_block_id=from_block_id)
            except Exception:
                logger.exception("DAG execution failed", extra={"session_id": session_id})
            finally:
                _running_executors.pop(session_id, None)

    if body.action in (PipelineAction.RUN, PipelineAction.RERUN):
        background_tasks.add_task(_run, None)
    elif body.action == PipelineAction.CONTINUE_FROM:
        background_tasks.add_task(_run, body.from_block_id)

    return {"status": "accepted", "action": body.action.value}


@router.post("/apply-template", response_model=DAGDefinition)
async def apply_template(
    session_id: str,
    body: dict[str, str],
    db: AsyncSession = Depends(get_db),
) -> DAGDefinition:
    session = await _get_session_or_404(db, session_id)
    template_id = body.get("template_id")
    if not template_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="template_id required")

    template = await db.scalar(select(PipelineTemplate).where(PipelineTemplate.id == template_id))
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    dag_def = json.loads(template.dag_definition)

    await db.execute(delete(SessionEdge).where(SessionEdge.session_id == session_id))
    await db.execute(delete(SessionBlock).where(SessionBlock.session_id == session_id))
    await db.flush()

    for node_data in dag_def.get("nodes", []):
        block = SessionBlock(
            id=node_data["id"],
            session_id=session_id,
            block_type_id=node_data["block_type"],
            position_x=float(node_data.get("position", {}).get("x", 0)),
            position_y=float(node_data.get("position", {}).get("y", 0)),
            config=json.dumps(node_data["config"]) if node_data.get("config") else None,
            status="idle",
        )
        db.add(block)

    await db.flush()

    for edge_data in dag_def.get("edges", []):
        edge = SessionEdge(
            id=edge_data["id"],
            session_id=session_id,
            source_block_id=edge_data["source"],
            target_block_id=edge_data["target"],
            source_handle=edge_data.get("source_handle"),
            target_handle=edge_data.get("target_handle"),
        )
        db.add(edge)

    session.template_id = template_id
    await db.commit()
    return await _load_dag_from_db(db, session_id)


@router.get("/blocks/{block_id}/messages", response_model=list[SessionBlockMessage])
async def get_block_messages(
    session_id: str,
    block_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[SessionBlockMessage]:
    result = await db.execute(
        select(BlockMessage).where(
            BlockMessage.block_id == block_id,
            BlockMessage.session_id == session_id,
        )
    )
    messages = result.scalars().all()
    return [
        SessionBlockMessage(
            id=m.id,
            block_id=m.block_id,
            role=m.role,
            content=m.content,
            created_at=m.created_at.isoformat(),
        )
        for m in messages
    ]


@router.post("/blocks/{block_id}/chat")
async def block_chat(
    session_id: str,
    block_id: str,
    body: BlockChatRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    client: Mistral = Depends(get_mistral_client),
) -> dict[str, str]:
    block = await db.scalar(
        select(SessionBlock).where(
            SessionBlock.id == block_id,
            SessionBlock.session_id == session_id,
        )
    )
    if block is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found")

    user_msg = BlockMessage(
        session_id=session_id,
        block_id=block_id,
        role="user",
        content=body.message,
    )
    db.add(user_msg)
    await db.commit()

    registry = _get_registry(client)

    async def _chat_task() -> None:
        async with AsyncSessionLocal() as bg_db:
            try:
                bg_block = await bg_db.scalar(select(SessionBlock).where(SessionBlock.id == block_id))
                if bg_block is None:
                    return

                agent_id = bg_block.agent_id
                if not agent_id:
                    agent = await registry.get_or_create_agent(
                        block_type=bg_block.block_type_id,
                        block_id=block_id,
                    )
                    from app.agents.dag_executor import _get_field

                    agent_id = str(_get_field(agent, "id") or "")
                    if agent_id:
                        bg_block.agent_id = agent_id
                        await bg_db.commit()

                if not agent_id:
                    return

                from app.agents.dag_executor import _extract_conversation_text
                from app.services.retry import retry_sync

                response = await asyncio.to_thread(
                    retry_sync,
                    client.beta.conversations.start,
                    agent_id=agent_id,
                    inputs=body.message,
                    timeout_ms=90_000,
                )
                text = _extract_conversation_text(response)

                assistant_msg = BlockMessage(
                    session_id=session_id,
                    block_id=block_id,
                    role="assistant",
                    content=text,
                )
                bg_db.add(assistant_msg)
                await bg_db.commit()

                from datetime import UTC, datetime

                from app.models.schemas import SSEEvent
                from sqlalchemy import func

                from app.models.database import Event

                max_seq = await bg_db.scalar(
                    select(func.max(Event.seq)).where(Event.session_id == session_id)
                )
                seq = int(max_seq or 0) + 1

                event = SSEEvent(
                    session_id=session_id,
                    seq=seq,
                    ts=datetime.now(UTC).isoformat(),
                    type="block.agent.message",
                    payload={"block_id": block_id, "text": text, "role": "assistant"},
                )
                await stream_manager.publish(session_id, event)
                db_event = Event(
                    session_id=session_id,
                    seq=seq,
                    event_type="block.agent.message",
                    payload=json.dumps({"block_id": block_id, "text": text}),
                )
                bg_db.add(db_event)
                await bg_db.commit()
            except Exception:
                logger.exception("Block chat failed", extra={"block_id": block_id})

    background_tasks.add_task(_chat_task)
    return {"status": "sent"}
