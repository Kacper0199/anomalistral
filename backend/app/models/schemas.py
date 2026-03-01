from datetime import datetime
from enum import Enum
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
    template_id: str | None = None

    model_config = ConfigDict(from_attributes=True)


class SessionCommand(BaseModel):
    command: Literal["approve", "modify", "cancel", "chat"]
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


class BlockType(str, Enum):
    UPLOAD = "upload"
    EDA = "eda"
    NORMALIZATION = "normalization"
    IMPUTATION = "imputation"
    ALGORITHM = "algorithm"
    AGGREGATOR = "aggregator"
    ANOMALY_VIZ = "anomaly_viz"


class BlockStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    SUCCESS = "success"
    ERROR = "error"
    PAUSED = "paused"


class BlockConfig(BaseModel):
    method: str | None = None
    weights: dict[str, float] | None = None
    prompt_override: str | None = None
    columns: list[str] | None = None
    params: dict[str, Any] | None = None


class NodePosition(BaseModel):
    x: float
    y: float


class DAGNode(BaseModel):
    id: str
    block_type: BlockType
    position: NodePosition
    config: BlockConfig | None = None
    status: BlockStatus = BlockStatus.IDLE


class DAGEdge(BaseModel):
    id: str
    source: str
    target: str
    source_handle: str | None = None
    target_handle: str | None = None


class DAGDefinition(BaseModel):
    nodes: list[DAGNode]
    edges: list[DAGEdge]


class DAGUpdateRequest(BaseModel):
    dag: DAGDefinition


class BlockConfigUpdate(BaseModel):
    config: BlockConfig


class BlockChatRequest(BaseModel):
    block_id: str
    message: str


class PipelineAction(str, Enum):
    RUN = "run"
    STOP = "stop"
    PAUSE = "pause"
    RERUN = "rerun"
    CONTINUE_FROM = "continue_from"


class PipelineControlRequest(BaseModel):
    action: PipelineAction
    from_block_id: str | None = None


class TemplateResponse(BaseModel):
    id: str
    name: str
    description: str | None
    dag: DAGDefinition
    model_config = ConfigDict(from_attributes=True)


class BlockDefinitionResponse(BaseModel):
    id: str
    display_name: str
    category: str
    input_types: list[str]
    output_types: list[str]
    has_agent: bool
    icon: str | None
    color: str | None
    model_config = ConfigDict(from_attributes=True)


class BlockResponse(BaseModel):
    id: str
    block_type: str
    position: NodePosition
    config: BlockConfig | None
    status: BlockStatus
    result: dict[str, Any] | None
    error_message: str | None
    model_config = ConfigDict(from_attributes=True)


class SessionBlockMessage(BaseModel):
    id: str
    block_id: str
    role: str
    content: str
    created_at: str
    model_config = ConfigDict(from_attributes=True)


class AddBlockRequest(BaseModel):
    block_type: BlockType
    position: NodePosition
    config: BlockConfig | None = None


class AddEdgeRequest(BaseModel):
    source: str
    target: str
    source_handle: str | None = None
    target_handle: str | None = None
