"use client";

import { create } from "zustand";

import type { ChatMessage, Session } from "@/types";

interface SessionStore {
  currentSession: Session | null;
  messages: ChatMessage[];
  isLoading: boolean;
  blockMessages: Record<string, ChatMessage[]>;
  setSession: (session: Session | null) => void;
  addMessage: (message: ChatMessage) => void;
  setLoading: (isLoading: boolean) => void;
  reset: () => void;
  addBlockMessage: (blockId: string, message: ChatMessage) => void;
  clearBlockMessages: (blockId: string) => void;
  setBlockMessages: (blockId: string, messages: ChatMessage[]) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  currentSession: null,
  messages: [],
  isLoading: false,
  blockMessages: {},

  setSession: (session) => set({ currentSession: session }),

  addMessage: (message) =>
    set((state) => {
      if (state.messages.some((m) => m.id === message.id)) {
        return state;
      }
      return { messages: [...state.messages, message] };
    }),

  setLoading: (isLoading) => set({ isLoading }),

  reset: () => set({ currentSession: null, messages: [], isLoading: false, blockMessages: {} }),

  addBlockMessage: (blockId, message) =>
    set((state) => {
      const existing = state.blockMessages[blockId] ?? [];
      if (existing.some((m) => m.id === message.id)) {
        return state;
      }
      return {
        blockMessages: {
          ...state.blockMessages,
          [blockId]: [...existing, message],
        },
      };
    }),

  clearBlockMessages: (blockId) =>
    set((state) => ({
      blockMessages: {
        ...state.blockMessages,
        [blockId]: [],
      },
    })),

  setBlockMessages: (blockId, messages) =>
    set((state) => ({
      blockMessages: {
        ...state.blockMessages,
        [blockId]: messages,
      },
    })),
}));
