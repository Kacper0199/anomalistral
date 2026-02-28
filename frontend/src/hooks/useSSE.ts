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
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addEvent = useStreamStore((state) => state.addEvent);
  const isConnected = useStreamStore((state) => state.isConnected);
  const setConnected = useStreamStore((state) => state.setConnected);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
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
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
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
        if (controller.signal.aborted) {
          setConnected(false);
          return;
        }
        if (retriesRef.current >= MAX_RETRIES) {
          abortRef.current = null;
          setConnected(false);
          return;
        }
        if (!reconnectTimerRef.current) {
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            setConnected(false);
          }, 2000);
        }
        retriesRef.current += 1;
        throw new Error("SSE closed by server");
      },
      onerror: () => {
        if (controller.signal.aborted) {
          return null;
        }
        if (retriesRef.current >= MAX_RETRIES) {
          abortRef.current = null;
          setConnected(false);
          return null;
        }
        if (!reconnectTimerRef.current) {
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            setConnected(false);
          }, 2000);
        }
        retriesRef.current += 1;
        const delay = Math.min(BASE_DELAY * Math.pow(2, retriesRef.current - 1), 10000);
        return delay;
      },
    }).finally(() => {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setConnected(false);
      }
    });
  }, [addEvent, sessionId, setConnected]);

  return {
    connect,
    disconnect,
    isConnected,
  };
}
