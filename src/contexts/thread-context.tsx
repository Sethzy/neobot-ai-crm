/**
 * In-memory thread state for chat navigation in PR2.
 * @module contexts/thread-context
 */
"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import type { Thread } from "@/types/chat";

interface ThreadContextValue {
  threads: Thread[];
  activeThreadId: string;
  createThread: () => void;
  selectThread: (id: string) => void;
  updateThreadTitle: (id: string, title: string) => void;
}

const ThreadContext = createContext<ThreadContextValue | null>(null);

function createThreadId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `thread-${crypto.randomUUID()}`;
  }

  return `thread-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createNewThread(): Thread {
  return {
    id: createThreadId(),
    title: "New Chat",
    createdAt: new Date(),
  };
}

export function ThreadProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(() => {
    const initialThread = createNewThread();
    return {
      threads: [initialThread],
      activeThreadId: initialThread.id,
    };
  });

  const createThread = useCallback(() => {
    const nextThread = createNewThread();

    setState((previousState) => ({
      threads: [nextThread, ...previousState.threads],
      activeThreadId: nextThread.id,
    }));
  }, []);

  const selectThread = useCallback((id: string) => {
    setState((previousState) => ({
      ...previousState,
      activeThreadId: id,
    }));
  }, []);

  const updateThreadTitle = useCallback((id: string, title: string) => {
    setState((previousState) => ({
      ...previousState,
      threads: previousState.threads.map((thread) =>
        thread.id === id ? { ...thread, title } : thread,
      ),
    }));
  }, []);

  const value = useMemo<ThreadContextValue>(
    () => ({
      threads: state.threads,
      activeThreadId: state.activeThreadId,
      createThread,
      selectThread,
      updateThreadTitle,
    }),
    [state, createThread, selectThread, updateThreadTitle],
  );

  return <ThreadContext.Provider value={value}>{children}</ThreadContext.Provider>;
}

export function useThreads(): ThreadContextValue {
  const context = useContext(ThreadContext);

  if (!context) {
    throw new Error("useThreads must be used within a ThreadProvider");
  }

  return context;
}
