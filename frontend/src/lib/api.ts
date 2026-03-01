import type {
  Session,
  UploadResponse,
  DAGDefinition,
  DAGValidationResult,
  AddBlockRequest,
  BlockResponse,
  BlockConfig,
  AddEdgeRequest,
  AddEdgeResponse,
  PipelineControlRequest,
  PipelineControlResponse,
  TemplateResponse,
  SessionBlockMessage,
  BlockDefinitionResponse,
} from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

async function parseError(response: Response): Promise<never> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = (await response.json()) as { detail?: string; message?: string };
    throw new Error(json.detail ?? json.message ?? `Request failed with status ${response.status}`);
  }
  const text = await response.text();
  throw new Error(text || `Request failed with status ${response.status}`);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    await parseError(response);
  }

  return (await response.json()) as T;
}

async function requestVoid(path: string, init?: RequestInit): Promise<void> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    await parseError(response);
  }
}

export function createSession(prompt: string): Promise<Session> {
  return request<Session>("/sessions", {
    method: "POST",
    body: JSON.stringify({ user_prompt: prompt }),
  });
}

export function getSession(id: string): Promise<Session> {
  return request<Session>(`/sessions/${id}`);
}

export async function uploadFile(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_URL}/uploads`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    await parseError(response);
  }

  return (await response.json()) as UploadResponse;
}

export function startPipeline(sessionId: string): Promise<void> {
  return requestVoid(`/pipelines/${sessionId}/start`, {
    method: "POST",
  });
}

export function sendCommand(
  sessionId: string,
  command: string,
  payload?: Record<string, unknown>
): Promise<void> {
  return requestVoid(`/sessions/${sessionId}/command`, {
    method: "POST",
    body: JSON.stringify({ command, payload }),
  });
}

export function updateDAG(sessionId: string, dagConfig: Record<string, unknown>): Promise<void> {
  return requestVoid(`/sessions/${sessionId}/dag`, {
    method: "PUT",
    body: JSON.stringify({ dag_config: dagConfig }),
  });
}

export function getDAG(sessionId: string): Promise<DAGDefinition> {
  return request<DAGDefinition>(`/sessions/${sessionId}/dag`);
}

export function saveDAG(sessionId: string, dag: DAGDefinition): Promise<DAGDefinition> {
  return request<DAGDefinition>(`/sessions/${sessionId}/dag`, {
    method: "PUT",
    body: JSON.stringify({ dag }),
  });
}

export function validateDAG(sessionId: string): Promise<DAGValidationResult> {
  return request<DAGValidationResult>(`/sessions/${sessionId}/dag/validate`, {
    method: "POST",
  });
}

export function addBlock(sessionId: string, req: AddBlockRequest): Promise<BlockResponse> {
  return request<BlockResponse>(`/sessions/${sessionId}/blocks`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function updateBlock(
  sessionId: string,
  blockId: string,
  config: BlockConfig
): Promise<BlockResponse> {
  return request<BlockResponse>(`/sessions/${sessionId}/blocks/${blockId}`, {
    method: "PUT",
    body: JSON.stringify({ config }),
  });
}

export function deleteBlock(
  sessionId: string,
  blockId: string
): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/sessions/${sessionId}/blocks/${blockId}`, {
    method: "DELETE",
  });
}

export function addEdge(sessionId: string, req: AddEdgeRequest): Promise<AddEdgeResponse> {
  return request<AddEdgeResponse>(`/sessions/${sessionId}/edges`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function deleteEdge(
  sessionId: string,
  edgeId: string
): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/sessions/${sessionId}/edges/${edgeId}`, {
    method: "DELETE",
  });
}

export function controlPipeline(
  sessionId: string,
  req: PipelineControlRequest
): Promise<PipelineControlResponse> {
  return request<PipelineControlResponse>(`/sessions/${sessionId}/pipeline/control`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function applyTemplate(sessionId: string, templateId: string): Promise<DAGDefinition> {
  return request<DAGDefinition>(`/sessions/${sessionId}/apply-template`, {
    method: "POST",
    body: JSON.stringify({ template_id: templateId }),
  });
}

export function getTemplates(): Promise<TemplateResponse[]> {
  return request<TemplateResponse[]>("/templates");
}

export function getTemplate(templateId: string): Promise<TemplateResponse> {
  return request<TemplateResponse>(`/templates/${templateId}`);
}

export function getBlockMessages(
  sessionId: string,
  blockId: string
): Promise<SessionBlockMessage[]> {
  return request<SessionBlockMessage[]>(`/sessions/${sessionId}/blocks/${blockId}/messages`);
}

export function sendBlockChat(
  sessionId: string,
  blockId: string,
  message: string
): Promise<{ status: string }> {
  return request<{ status: string }>(`/sessions/${sessionId}/blocks/${blockId}/chat`, {
    method: "POST",
    body: JSON.stringify({ block_id: blockId, message }),
  });
}

export function getBlockDefinitions(): Promise<BlockDefinitionResponse[]> {
  return request<BlockDefinitionResponse[]>("/block-definitions");
}

export { API_URL };
