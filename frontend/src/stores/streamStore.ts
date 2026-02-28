"use client";

import { create } from "zustand";

import type { SSEEvent } from "@/types";

interface StreamStore {
  events: SSEEvent[];
  isConnected: boolean;
  lastSeq: number;
  addEvent: (event: SSEEvent) => void;
  setConnected: (connected: boolean) => void;
  clear: () => void;
}

export const useStreamStore = create<StreamStore>((set) => ({
  events: [],
  isConnected: false,
  lastSeq: 0,
  addEvent: (event) =>
    set((state) => ({
      events: [...state.events, event].slice(-500),
      lastSeq: event.seq,
    })),
  setConnected: (connected) => set({ isConnected: connected }),
  clear: () => set({ events: [], isConnected: false, lastSeq: 0 }),
}));
