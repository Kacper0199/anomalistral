from functools import lru_cache
from typing import Any
import json

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    MISTRAL_API_KEY: str
    MISTRAL_DEFAULT_MODEL: str = "mistral-large-latest"
    MISTRAL_SMALL_MODEL: str = "ministral-8b-latest"
    DATABASE_URL: str = "sqlite+aiosqlite:///./anomalistral.db"
    UPLOAD_DIR: str = "./uploads"
    ARTIFACT_DIR: str = "./artifacts"
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"]
    LOG_LEVEL: str = "INFO"
    PORT: int = 8000

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> list[str]:
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                parsed = json.loads(stripped)
                if isinstance(parsed, list):
                    return [str(item) for item in parsed]
            return [item.strip() for item in value.split(",") if item.strip()]
        if isinstance(value, list):
            return [str(item) for item in value]
        raise ValueError("CORS_ORIGINS must be a list or comma-separated string")


@lru_cache
def get_settings() -> Settings:
    return Settings(**{})


settings = get_settings()
