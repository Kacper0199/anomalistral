from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class SessionCreate(BaseModel):
    user_prompt: str = Field(min_length=1)


class SessionResponse(BaseModel):
    id: str
    status: str
    user_prompt: str
    dataset_filename: str | None
    created_at: datetime
    eda_results: dict[str, Any] | None = None
    algorithm_recommendations: dict[str, Any] | None = None
    generated_code: str | None = None
    validation_results: dict[str, Any] | None = None
    dag_config: dict[str, Any] | None = None

    model_config = ConfigDict(from_attributes=True)


class SessionCommand(BaseModel):
    command: Literal["approve", "modify", "cancel"]
    payload: dict[str, Any] | None = None


class DAGUpdate(BaseModel):
    dag_config: dict[str, Any]


class UploadResponse(BaseModel):
    filename: str
    path: str
    size: int


class SSEEvent(BaseModel):
    v: int = 1
    session_id: str
    seq: int
    ts: str
    type: str
    payload: dict[str, Any]


class HealthResponse(BaseModel):
    status: str
    version: str
