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
  useRef,
  useState,
} from "react";

import { useClientId } from "@/hooks/use-client-id";
import {
  useCreateThread,
  useThreads as useThreadRows,
  useUpdateThreadTitle,
} from "@/hooks/use-threads";
import type { Thread } from "@/types/chat";

interface ThreadContextValue {
  threads: Thread[];
  activeThreadId: string;
  createThread: () => Promise<void>;
  selectThread: (id: string) => void;
  updateThreadTitle: (id: string, title: string) => void;
}

const ThreadContext = createContext<ThreadContextValue | null>(null);

export function ThreadProvider({ children }: { children: React.ReactNode }) {
  const [activeThreadId, setActiveThreadId] = useState("");
  const hasAutoCreatedInitialThread = useRef(false);

  const { data: clientId } = useClientId();
  const { data: threadRows = [], isLoading } = useThreadRows(clientId);
  const {
    mutate: createThreadMutate,
    mutateAsync: createThreadMutateAsync,
    isPending: isCreatingThread,
  } = useCreateThread(clientId);
  const { mutate: updateThreadTitleMutate } = useUpdateThreadTitle(clientId);

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
    hasAutoCreatedInitialThread.current = false;
  }, [clientId]);

  useEffect(() => {
    if (threadRows.length === 0) {
      setActiveThreadId("");
      return;
    }

    if (!activeThreadId) {
      setActiveThreadId(threadRows[0].thread_id);
    }
  }, [threadRows, activeThreadId]);

  useEffect(() => {
    if (!clientId || isLoading || isCreatingThread || threadRows.length > 0) {
      return;
    }

    if (hasAutoCreatedInitialThread.current) {
      return;
    }

    hasAutoCreatedInitialThread.current = true;
    createThreadMutate(null, {
      onSuccess: (thread) => {
        setActiveThreadId(thread.thread_id);
      },
      onError: () => {
        hasAutoCreatedInitialThread.current = false;
      },
    });
  }, [clientId, isLoading, isCreatingThread, threadRows.length, createThreadMutate]);

  const createThread = useCallback(async () => {
    const thread = await createThreadMutateAsync(null);
    setActiveThreadId(thread.thread_id);
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

  const value = useMemo<ThreadContextValue>(
    () => ({
      threads,
      activeThreadId,
      createThread,
      selectThread,
      updateThreadTitle,
    }),
    [threads, activeThreadId, createThread, selectThread, updateThreadTitle],
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
