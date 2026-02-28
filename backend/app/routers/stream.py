from fastapi import APIRouter, Request
from sse_starlette import EventSourceResponse

from app.services.streaming import stream_manager

router = APIRouter(prefix="/stream", tags=["stream"])


@router.get("/{session_id}")
async def stream_session(session_id: str, request: Request) -> EventSourceResponse:
    async def event_generator():
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
