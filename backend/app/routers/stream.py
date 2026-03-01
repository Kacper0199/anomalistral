import json
from datetime import UTC, datetime

from fastapi import APIRouter, Query, Request
from sqlalchemy import select
from sse_starlette import EventSourceResponse

from app.db.session import AsyncSessionLocal
from app.models.database import Event
from app.models.schemas import SSEEvent
from app.services.streaming import stream_manager

router = APIRouter(prefix="/stream", tags=["stream"])


@router.get("/{session_id}")
async def stream_session(
    session_id: str,
    request: Request,
    last_event_id: int = Query(default=0, alias="lastEventId"),
) -> EventSourceResponse:
    async def event_generator():
        if last_event_id > 0:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(Event)
                    .where(Event.session_id == session_id, Event.seq > last_event_id)
                    .order_by(Event.seq)
                )
                missed_events = result.scalars().all()
                for db_event in missed_events:
                    if await request.is_disconnected():
                        return
                    payload = json.loads(db_event.payload) if isinstance(db_event.payload, str) else db_event.payload
                    sse_event = SSEEvent(
                        session_id=session_id,
                        seq=db_event.seq,
                        ts=db_event.created_at.isoformat() if db_event.created_at else datetime.now(UTC).isoformat(),
                        type=db_event.event_type,
                        payload=payload,
                    )
                    yield {
                        "id": str(sse_event.seq),
                        "event": sse_event.type,
                        "data": sse_event.model_dump_json(),
                    }

        async for event in stream_manager.subscribe(session_id):
            if await request.is_disconnected():
                break
            yield {
                "id": str(event.seq),
                "event": event.type,
                "data": event.model_dump_json(),
            }
        await stream_manager.unsubscribe(session_id)

    return EventSourceResponse(event_generator())
