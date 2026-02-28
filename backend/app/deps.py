from functools import lru_cache
from typing import AsyncGenerator

from mistralai import Mistral
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.session import AsyncSessionLocal


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as db:
        yield db


@lru_cache
def get_mistral_client() -> Mistral:
    settings = get_settings()
    return Mistral(api_key=settings.MISTRAL_API_KEY)
