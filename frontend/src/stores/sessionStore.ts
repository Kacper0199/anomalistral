"use client";

import { create } from "zustand";

import type { ChatMessage, Session } from "@/types";

interface SessionStore {
  currentSession: Session | null;
  messages: ChatMessage[];
  isLoading: boolean;
  setSession: (session: Session | null) => void;
  addMessage: (message: ChatMessage) => void;
  setLoading: (isLoading: boolean) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  currentSession: null,
  messages: [],
  isLoading: false,
  setSession: (session) => set({ currentSession: session }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setLoading: (isLoading) => set({ isLoading }),
  reset: () => set({ currentSession: null, messages: [], isLoading: false }),
}));
