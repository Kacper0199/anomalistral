import asyncio
import random
import time
from collections.abc import Awaitable, Callable
from functools import wraps
from typing import ParamSpec, TypeVar

P = ParamSpec("P")
T = TypeVar("T")

RETRYABLE_KEYWORDS = ("rate", "429", "500", "502", "503", "timeout", "connection")


def is_retryable(exc: Exception) -> bool:
    if isinstance(exc, (ConnectionError, TimeoutError)):
        return True
    return any(keyword in str(exc).lower() for keyword in RETRYABLE_KEYWORDS)


def _backoff_delay(attempt: int, base_delay: float, max_delay: float) -> float:
    exponential = min(max_delay, base_delay * (2**attempt))
    jitter = random.uniform(0.0, exponential * 0.2)
    return min(max_delay, exponential + jitter)


def retry_sync(
    fn: Callable[P, T],
    *args: P.args,
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    **kwargs: P.kwargs,
) -> T:
    attempt = 0
    while True:
        try:
            return fn(*args, **kwargs)
        except Exception as exc:
            if attempt >= max_retries or not is_retryable(exc):
                raise
            time.sleep(_backoff_delay(attempt, base_delay, max_delay))
            attempt += 1


async def retry_async(
    fn: Callable[P, Awaitable[T]],
    *args: P.args,
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    **kwargs: P.kwargs,
) -> T:
    attempt = 0
    while True:
        try:
            return await fn(*args, **kwargs)
        except Exception as exc:
            if attempt >= max_retries or not is_retryable(exc):
                raise
            await asyncio.sleep(_backoff_delay(attempt, base_delay, max_delay))
            attempt += 1


def retryable_sync(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
) -> Callable[[Callable[P, T]], Callable[P, T]]:
    def decorator(fn: Callable[P, T]) -> Callable[P, T]:
        @wraps(fn)
        def wrapped(*args: P.args, **kwargs: P.kwargs) -> T:
            return retry_sync(
                fn,
                *args,
                max_retries=max_retries,
                base_delay=base_delay,
                max_delay=max_delay,
                **kwargs,
            )

        return wrapped

    return decorator


def retryable_async(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
) -> Callable[[Callable[P, Awaitable[T]]], Callable[P, Awaitable[T]]]:
    def decorator(fn: Callable[P, Awaitable[T]]) -> Callable[P, Awaitable[T]]:
        @wraps(fn)
        async def wrapped(*args: P.args, **kwargs: P.kwargs) -> T:
            return await retry_async(
                fn,
                *args,
                max_retries=max_retries,
                base_delay=base_delay,
                max_delay=max_delay,
                **kwargs,
            )

        return wrapped

    return decorator
