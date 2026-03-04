/**
 * Thread state context backed by chat persistence hooks.
 * @module contexts/thread-context
 */
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useClientId } from "@/hooks/use-client-id";
import {
  useArchiveThread,
  useCreateThread,
  useThreads as useThreadRows,
  useUpdateThreadTitle,
} from "@/hooks/use-threads";
import type { Thread } from "@/types/chat";

interface ThreadContextValue {
  threads: Thread[];
  activeThreadId: string;
  /** Creates a new thread and returns its ID. */
  createThread: () => Promise<string>;
  selectThread: (id: string) => void;
  updateThreadTitle: (id: string, title: string) => void;
  /** Archives a thread and returns whether the operation succeeded. */
  archiveThread: (id: string) => Promise<boolean>;
}

const ThreadContext = createContext<ThreadContextValue | null>(null);

export function ThreadProvider({ children }: { children: React.ReactNode }) {
  const [activeThreadId, setActiveThreadId] = useState("");

  const { data: clientId } = useClientId();
  const { data: threadRows = [] } = useThreadRows(clientId);
  const {
    mutateAsync: createThreadMutateAsync,
  } = useCreateThread(clientId);
  const { mutate: updateThreadTitleMutate } = useUpdateThreadTitle(clientId);
  const { mutateAsync: archiveThreadMutateAsync } = useArchiveThread(clientId);

  const threads = useMemo<Thread[]>(
    () =>
      threadRows.map((thread) => ({
        id: thread.thread_id,
        title: thread.title ?? "New Chat",
        createdAt: new Date(thread.created_at),
      })),
    [threadRows],
  );

  useEffect(() => {
    if (threadRows.length === 0) {
      setActiveThreadId("");
      return;
    }

    if (!activeThreadId) {
      setActiveThreadId(threadRows[0].thread_id);
    }
  }, [threadRows, activeThreadId]);

  const createThread = useCallback(async () => {
    const thread = await createThreadMutateAsync(null);
    setActiveThreadId(thread.thread_id);
    return thread.thread_id;
  }, [createThreadMutateAsync]);

  const selectThread = useCallback((id: string) => {
    const hasThread = threadRows.some((thread) => thread.thread_id === id);
    if (hasThread) {
      setActiveThreadId(id);
    }
  }, [threadRows]);

  const updateThreadTitle = useCallback((id: string, title: string) => {
    updateThreadTitleMutate({ threadId: id, title });
  }, [updateThreadTitleMutate]);

  const archiveThread = useCallback(async (id: string) => {
    try {
      await archiveThreadMutateAsync(id);
      if (activeThreadId === id && threadRows.length > 1) {
        const next = threadRows.find((t) => t.thread_id !== id);
        if (next) {
          setActiveThreadId(next.thread_id);
        }
      }
      return true;
    } catch {
      return false;
    }
  }, [archiveThreadMutateAsync, activeThreadId, threadRows]);

  const value = useMemo<ThreadContextValue>(
    () => ({
      threads,
      activeThreadId,
      createThread,
      selectThread,
      updateThreadTitle,
      archiveThread,
    }),
    [threads, activeThreadId, createThread, selectThread, updateThreadTitle, archiveThread],
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
