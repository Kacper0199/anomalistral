"use client";

import { useCallback, useRef } from "react";

import { fetchEventSource } from "@microsoft/fetch-event-source";

import { API_URL } from "@/lib/api";
import { useStreamStore } from "@/stores/streamStore";
import type { SSEEvent } from "@/types";

export function useSSE(sessionId: string | null) {
  const abortRef = useRef<AbortController | null>(null);
  const addEvent = useStreamStore((state) => state.addEvent);
  const isConnected = useStreamStore((state) => state.isConnected);
  const setConnected = useStreamStore((state) => state.setConnected);

  const disconnect = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setConnected(false);
  }, [setConnected]);

  const connect = useCallback(() => {
    if (!sessionId || abortRef.current) {
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const seq = useStreamStore.getState().lastSeq;

    void fetchEventSource(`${API_URL}/stream/${sessionId}`, {
      method: "GET",
      signal: controller.signal,
      openWhenHidden: true,
      headers: {
        ...(seq > 0 ? { "Last-Event-ID": String(seq) } : {}),
      },
      onopen: async (response) => {
        if (!response.ok) {
          throw new Error(`SSE connection failed with status ${response.status}`);
        }
        setConnected(true);
      },
      onmessage: (message) => {
        if (!message.data) {
          return;
        }
        try {
          const parsed = JSON.parse(message.data) as SSEEvent;
          addEvent(parsed);
        } catch {
          return;
        }
      },
      onclose: () => {
        setConnected(false);
        throw new Error("SSE closed");
      },
      onerror: () => {
        if (controller.signal.aborted) {
          return null;
        }
        setConnected(false);
        return 1000;
      },
    }).finally(() => {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setConnected(false);
    });
  }, [addEvent, sessionId, setConnected]);

  return {
    connect,
    disconnect,
    isConnected,
  };
}
