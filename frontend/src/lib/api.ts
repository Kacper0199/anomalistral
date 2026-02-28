import type { Session, UploadResponse } from "@/types";

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
    body: JSON.stringify({ prompt }),
  });
}

export function getSession(id: string): Promise<Session> {
  return request<Session>(`/sessions/${id}`);
}

export async function uploadFile(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_URL}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    await parseError(response);
  }

  return (await response.json()) as UploadResponse;
}

export function startPipeline(sessionId: string): Promise<void> {
  return requestVoid(`/sessions/${sessionId}/start`, {
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

export { API_URL };
