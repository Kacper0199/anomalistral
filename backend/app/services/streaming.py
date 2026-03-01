import asyncio
from typing import AsyncGenerator

from app.models.schemas import SSEEvent


class StreamManager:
    def __init__(self) -> None:
        self._subscribers: dict[str, list[asyncio.Queue[SSEEvent]]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, session_id: str) -> AsyncGenerator[SSEEvent, None]:
        queue: asyncio.Queue[SSEEvent] = asyncio.Queue()
        async with self._lock:
            self._subscribers.setdefault(session_id, []).append(queue)
        try:
            while True:
                event = await queue.get()
                yield event
        finally:
            async with self._lock:
                subs = self._subscribers.get(session_id)
                if subs and queue in subs:
                    subs.remove(queue)
                if subs is not None and len(subs) == 0:
                    self._subscribers.pop(session_id, None)

    async def publish(self, session_id: str, event: SSEEvent) -> None:
        async with self._lock:
            queues = self._subscribers.get(session_id, [])
            snapshot = list(queues)
        for q in snapshot:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

    async def unsubscribe(self, session_id: str) -> None:
        pass


stream_manager = StreamManager()
