export type SessionStatus =
  | "created"
  | "eda_running"
  | "algorithm_running"
  | "codegen_running"
  | "validation_running"
  | "completed"
  | "failed";

export type SSEEventType =
  | "pipeline.started"
  | "pipeline.completed"
  | "pipeline.failed"
  | "eda.started"
  | "eda.completed"
  | "algorithm.started"
  | "algorithm.completed"
  | "codegen.started"
  | "codegen.completed"
  | "validation.started"
  | "validation.completed"
  | "chat.response"
  | "command.chat"
  | "command.approve"
  | "command.modify"
  | "command.cancel";

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
}

export interface PipelineNodeData extends Record<string, unknown> {
  label: string;
  status: "idle" | "running" | "success" | "error";
  type: "upload" | "eda" | "algorithm" | "codegen" | "validation" | "deploy";
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
