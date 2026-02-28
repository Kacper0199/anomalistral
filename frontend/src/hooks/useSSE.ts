"use client";

import { useCallback, useRef } from "react";

import { fetchEventSource } from "@microsoft/fetch-event-source";

import { API_URL } from "@/lib/api";
import { useStreamStore } from "@/stores/streamStore";
import type { SSEEvent } from "@/types";

const MAX_RETRIES = 5;
const BASE_DELAY = 1000;

export function useSSE(sessionId: string | null) {
  const abortRef = useRef<AbortController | null>(null);
  const retriesRef = useRef(0);
  const addEvent = useStreamStore((state) => state.addEvent);
  const isConnected = useStreamStore((state) => state.isConnected);
  const setConnected = useStreamStore((state) => state.setConnected);

  const disconnect = useCallback(() => {
    const controller = abortRef.current;
    abortRef.current = null;
    if (controller) {
      controller.abort();
    }
    setConnected(false);
  }, [setConnected]);

  const connect = useCallback(() => {
    if (!sessionId || abortRef.current) {
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    retriesRef.current = 0;

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
        retriesRef.current = 0;
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
        if (controller.signal.aborted) {
          return;
        }
        if (retriesRef.current >= MAX_RETRIES) {
          abortRef.current = null;
          return;
        }
        retriesRef.current += 1;
        throw new Error("SSE closed by server");
      },
      onerror: () => {
        if (controller.signal.aborted) {
          return null;
        }
        setConnected(false);
        if (retriesRef.current >= MAX_RETRIES) {
          abortRef.current = null;
          return null;
        }
        retriesRef.current += 1;
        const delay = Math.min(BASE_DELAY * Math.pow(2, retriesRef.current - 1), 10000);
        return delay;
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
