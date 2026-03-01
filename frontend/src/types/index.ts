export type SessionStatus =
  | "created"
  | "idle"
  | "eda_running"
  | "algorithm_running"
  | "codegen_running"
  | "completed"
  | "failed";

export type SSEEventType =
  | "pipeline.started"
  | "pipeline.completed"
  | "pipeline.failed"
  | "eda.started"
  | "eda.completed"
  | "eda.failed"
  | "algorithm.started"
  | "algorithm.completed"
  | "algorithm.failed"
  | "codegen.started"
  | "codegen.completed"
  | "codegen.failed"
  | "validation.started"
  | "validation.completed"
  | "validation.failed"
  | "chat.response"
  | "command.chat"
  | "command.approve"
  | "command.modify"
  | "command.cancel"
  | "block.started"
  | "block.completed"
  | "block.failed"
  | "block.agent.message"
  | "dag.validated";

export interface SSEEvent {
  v: number;
  session_id: string;
  seq: number;
  ts: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface Session {
  id: string;
  status: SessionStatus;
  user_prompt: string;
  dataset_filename: string | null;
  created_at: string;
  eda_results: Record<string, unknown> | null;
  algorithm_recommendations: Record<string, unknown> | null;
  generated_code: string | null;
  validation_results: Record<string, unknown> | null;
  dag_config: Record<string, unknown> | null;
  template_id: string | null;
}

export type BlockType =
  | "upload"
  | "eda"
  | "normalization"
  | "imputation"
  | "algorithm"
  | "aggregator"
  | "anomaly_viz";

export type BlockStatus = "idle" | "running" | "success" | "error" | "paused";

export interface BlockConfig {
  method?: string;
  weights?: Record<string, number>;
  prompt_override?: string;
  columns?: string[];
  params?: Record<string, unknown>;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface DAGNode {
  id: string;
  block_type: BlockType;
  position: NodePosition;
  config?: BlockConfig | null;
  status: BlockStatus;
}

export interface DAGEdge {
  id: string;
  source: string;
  target: string;
  source_handle?: string | null;
  target_handle?: string | null;
}

export interface DAGDefinition {
  nodes: DAGNode[];
  edges: DAGEdge[];
}

export interface DAGUpdateRequest {
  dag: DAGDefinition;
}

export interface BlockConfigUpdate {
  config: BlockConfig;
}

export interface BlockChatRequest {
  block_id: string;
  message: string;
}

export type PipelineAction = "run" | "stop" | "pause" | "rerun" | "continue_from";

export interface PipelineControlRequest {
  action: PipelineAction;
  from_block_id?: string | null;
}

export interface TemplateResponse {
  id: string;
  name: string;
  description?: string | null;
  dag: DAGDefinition;
}

export interface BlockDefinitionResponse {
  id: string;
  display_name: string;
  category: string;
  input_types: string[];
  output_types: string[];
  has_agent: boolean;
  icon?: string | null;
  color?: string | null;
}

export interface BlockResponse {
  id: string;
  block_type: string;
  position: NodePosition;
  config?: BlockConfig | null;
  status: BlockStatus;
  result?: Record<string, unknown> | null;
  error_message?: string | null;
}

export interface SessionBlockMessage {
  id: string;
  block_id: string;
  role: string;
  content: string;
  created_at: string;
}

export interface AddBlockRequest {
  block_type: BlockType;
  position: NodePosition;
  config?: BlockConfig | null;
}

export interface AddEdgeRequest {
  source: string;
  target: string;
  source_handle?: string | null;
  target_handle?: string | null;
}

export interface AddEdgeResponse {
  id: string;
  source: string;
  target: string;
  source_handle?: string | null;
  target_handle?: string | null;
}

export interface DAGValidationResult {
  valid: boolean;
  errors: string[];
}

export interface PipelineControlResponse {
  status: string;
  action: string;
}

export interface PipelineNodeData extends Record<string, unknown> {
  label: string;
  status: BlockStatus;
  type: BlockType;
  config?: BlockConfig | null;
  detail?: string;
  progress?: number;
  startedAt?: string;
  completedAt?: string;
  previewData?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  agent?: string;
  timestamp: string;
}

export interface UploadResponse {
  filename: string;
  path: string;
  size: number;
}
