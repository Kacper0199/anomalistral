export type SessionStatus =
  | "created"
  | "eda_running"
  | "algorithm_running"
  | "codegen_running"
  | "validation_running"
  | "completed"
  | "failed";

export type SSEEventType =
  | "status"
  | "delta"
  | "tool_call"
  | "tool_result"
  | "code_stdout"
  | "validation"
  | "error"
  | "dag_update";

export interface SSEEvent {
  v: number;
  session_id: string;
  seq: number;
  ts: string;
  type: SSEEventType;
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
