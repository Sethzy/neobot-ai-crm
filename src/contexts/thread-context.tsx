/**
 * Thread state context backed by chat persistence hooks.
 * URL is the single source of truth for which thread is active.
 * @module contexts/thread-context
 */
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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
  /** Creates a new thread and returns its ID. */
  createThread: () => Promise<string>;
  updateThreadTitle: (id: string, title: string) => void;
  /** Archives a thread and returns whether the operation succeeded. */
  archiveThread: (id: string) => Promise<boolean>;
}

const ThreadContext = createContext<ThreadContextValue | null>(null);

export function ThreadProvider({ children }: { children: React.ReactNode }) {
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
        isPinned: thread.is_pinned,
        createdAt: new Date(thread.created_at),
      })),
    [threadRows],
  );

  const createThread = useCallback(async () => {
    const thread = await createThreadMutateAsync(null);
    return thread.thread_id;
  }, [createThreadMutateAsync]);

  const updateThreadTitle = useCallback((id: string, title: string) => {
    updateThreadTitleMutate({ threadId: id, title });
  }, [updateThreadTitleMutate]);

  const archiveThread = useCallback(async (id: string) => {
    try {
      await archiveThreadMutateAsync(id);
      return true;
    } catch {
      return false;
    }
  }, [archiveThreadMutateAsync]);

  const value = useMemo<ThreadContextValue>(
    () => ({
      threads,
      createThread,
      updateThreadTitle,
      archiveThread,
    }),
    [threads, createThread, updateThreadTitle, archiveThread],
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
