"use client";

import { useCallback } from "react";

import {
  createSession,
  getSession,
  sendCommand,
  startPipeline,
  uploadFile,
} from "@/lib/api";
import { useSessionStore } from "@/stores/sessionStore";
import type { Session } from "@/types";

export function useSession() {
  const currentSession = useSessionStore((state) => state.currentSession);
  const isLoading = useSessionStore((state) => state.isLoading);
  const setSession = useSessionStore((state) => state.setSession);
  const setLoading = useSessionStore((state) => state.setLoading);
  const addMessage = useSessionStore((state) => state.addMessage);

  const createNewSession = useCallback(async (prompt: string, file?: File): Promise<Session> => {
    setLoading(true);
    try {
      const uploaded = file ? await uploadFile(file) : null;
      const session = await createSession(prompt);
      const hydratedSession: Session = {
        ...session,
        dataset_filename: uploaded?.filename ?? session.dataset_filename,
      };

      setSession(hydratedSession);

      if (uploaded) {
        await sendCommand(session.id, "modify", {
          dataset_path: uploaded.path,
          dataset_filename: uploaded.filename,
        });
      }

      // Send the user prompt directly to the orchestrator agent as the first chat message
      if (prompt.trim()) {
        await sendCommand(session.id, "chat", { message: prompt.trim() });
      }

      await startPipeline(session.id);

      addMessage({
        id: crypto.randomUUID(),
        role: "system",
        content: "Session started. Agents are preparing your pipeline.",
        timestamp: new Date().toISOString(),
      });

      return hydratedSession;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setSession, addMessage]);

  const loadSession = useCallback(async (id: string): Promise<Session> => {
    setLoading(true);
    try {
      const session = await getSession(id);
      const existing = useSessionStore.getState().currentSession;
      if (existing && existing.id === id) {
        const merged: Session = {
          ...session,
          eda_results: session.eda_results ?? existing.eda_results,
          algorithm_recommendations: session.algorithm_recommendations ?? existing.algorithm_recommendations,
          generated_code: session.generated_code ?? existing.generated_code,
          validation_results: session.validation_results ?? existing.validation_results,
        };
        setSession(merged);
        return merged;
      }
      setSession(session);
      return session;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setSession]);

  return {
    currentSession,
    isLoading,
    createNewSession,
    loadSession,
  };
}
