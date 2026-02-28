"use client";

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

  const createNewSession = async (prompt: string, file?: File): Promise<Session> => {
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
        await sendCommand(session.id, "dataset_uploaded", {
          filename: uploaded.filename,
          path: uploaded.path,
          size: uploaded.size,
        });
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
  };

  const loadSession = async (id: string): Promise<Session> => {
    setLoading(true);
    try {
      const session = await getSession(id);
      setSession(session);
      return session;
    } finally {
      setLoading(false);
    }
  };

  return {
    currentSession,
    isLoading,
    createNewSession,
    loadSession,
  };
}
