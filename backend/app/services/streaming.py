import asyncio
from typing import AsyncGenerator

from app.models.schemas import SSEEvent


class StreamManager:
    def __init__(self) -> None:
        self._queues: dict[str, asyncio.Queue[SSEEvent]] = {}
        self._subscribers: dict[str, int] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, session_id: str) -> AsyncGenerator[SSEEvent, None]:
        async with self._lock:
            if session_id not in self._queues:
                self._queues[session_id] = asyncio.Queue()
                self._subscribers[session_id] = 0
            self._subscribers[session_id] += 1
            queue = self._queues[session_id]

        try:
            while True:
                event = await queue.get()
                yield event
        finally:
            await self.unsubscribe(session_id)

    async def publish(self, session_id: str, event: SSEEvent) -> None:
        async with self._lock:
            if session_id not in self._queues:
                self._queues[session_id] = asyncio.Queue()
                self._subscribers[session_id] = 0
            queue = self._queues[session_id]
        await queue.put(event)

    async def unsubscribe(self, session_id: str) -> None:
        async with self._lock:
            if session_id not in self._subscribers:
                return
            self._subscribers[session_id] -= 1
            if self._subscribers[session_id] <= 0:
                self._subscribers.pop(session_id, None)
                self._queues.pop(session_id, None)


stream_manager = StreamManager()
