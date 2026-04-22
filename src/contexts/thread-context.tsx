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
  useEffect,
  useMemo,
  useRef,
} from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import posthog from "posthog-js";

import { useClientId } from "@/hooks/use-client-id";
import { buildAnalyticsContext } from "@/lib/analytics/posthog-context";
import { consumePendingPostHogAuthEvent } from "@/lib/analytics/posthog-auth-events";
import { supabase } from "@/lib/supabase";
import {
  useArchiveThread,
  useCreateThread,
  useMarkThreadRead,
  useThreads as useThreadRows,
  useUpdateThreadTitle,
  threadKeys,
} from "@/hooks/use-threads";
import type { Thread } from "@/types/chat";
import type { Database } from "@/types/database";

type ThreadRow = Database["public"]["Tables"]["conversation_threads"]["Row"];

function hasUnreadActivity(updatedAt: string, lastReadAt: string | null): boolean {
  if (!lastReadAt) {
    return true;
  }

  return Date.parse(updatedAt) > Date.parse(lastReadAt);
}

function parseActiveThreadId(pathname: string): string | null {
  if (!pathname.startsWith("/chat/")) {
    return null;
  }

  const [, chatSegment, threadId] = pathname.split("/");
  if (chatSegment !== "chat" || !threadId) {
    return null;
  }

  return threadId;
}

interface ThreadContextValue {
  threads: Thread[];
  /** True while the initial thread list is being fetched. */
  isLoading: boolean;
  /** Number of unread threads currently shown in thread navigation. */
  unreadCount: number;
  /** Creates a new thread and returns its ID. */
  createThread: () => Promise<string>;
  updateThreadTitle: (id: string, title: string) => void;
  /** Archives a thread and returns whether the operation succeeded. */
  archiveThread: (id: string) => Promise<boolean>;
  /** Marks a thread as read using optimistic local state. */
  markRead: (id: string) => Promise<void>;
}

const ThreadContext = createContext<ThreadContextValue | null>(null);

export function ThreadProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const queryClient = useQueryClient();
  const { data: clientId } = useClientId();
  const { data: threadRows = [], isLoading: isThreadsLoading } = useThreadRows(clientId);
  const {
    mutateAsync: createThreadMutateAsync,
  } = useCreateThread(clientId);
  const { mutate: updateThreadTitleMutate } = useUpdateThreadTitle(clientId);
  const { mutateAsync: archiveThreadMutateAsync } = useArchiveThread(clientId);
  const { mutateAsync: markThreadReadMutateAsync } = useMarkThreadRead(clientId);
  const lastMarkReadAttemptKeyByThreadIdRef = useRef<Record<string, string>>({});
  const activeThreadId = useMemo(() => parseActiveThreadId(pathname), [pathname]);

  useEffect(() => {
    if (!clientId) {
      return;
    }
    const resolvedClientId = clientId;

    const hasSupabaseEnv = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    ) && Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
    );

    if (!hasSupabaseEnv) {
      return;
    }

    let isCancelled = false;

    async function syncPostHogIdentity() {
      try {
        const [
          {
            data: { user },
            error: authError,
          },
          { data: clientProfile, error: clientError },
        ] = await Promise.all([
          supabase.auth.getUser(),
          supabase
            .from("clients")
            .select("plan_name, subscription_status")
            .eq("client_id", resolvedClientId)
            .maybeSingle(),
        ]);

        if (isCancelled || authError || clientError || !user) {
          return;
        }

        const analyticsContext = buildAnalyticsContext({
          email: user.email,
        });

        posthog.identify(resolvedClientId, {
          email: user.email,
          name:
            (typeof user.user_metadata?.display_name === "string"
              ? user.user_metadata.display_name
              : null) ||
            (typeof user.user_metadata?.full_name === "string"
              ? user.user_metadata.full_name
              : null),
          plan_name: clientProfile?.plan_name,
          subscription_status: clientProfile?.subscription_status,
          ...analyticsContext,
        });
        posthog.register(analyticsContext);

        const pendingAuthEvent = consumePendingPostHogAuthEvent();
        if (pendingAuthEvent) {
          posthog.capture(pendingAuthEvent.event, {
            method: pendingAuthEvent.method,
            ...analyticsContext,
          });
        }
      } catch (error) {
        if (!isCancelled) {
          console.error("[analytics] Failed to sync PostHog identity.", error);
        }
      }
    }

    void syncPostHogIdentity();

    return () => {
      isCancelled = true;
    };
  }, [clientId]);

  const threads = useMemo<Thread[]>(
    () =>
      threadRows.map((thread) => {
        const updatedAt = new Date(thread.updated_at);
        const isUnread = hasUnreadActivity(thread.updated_at, thread.last_read_at)
          && thread.thread_id !== activeThreadId;

        return {
          id: thread.thread_id,
          title: thread.title ?? "New Chat",
          isPinned: thread.is_pinned,
          isPrimary: thread.is_primary,
          createdAt: new Date(thread.created_at),
          updatedAt,
          lastReadAt: thread.last_read_at ? new Date(thread.last_read_at) : null,
          isUnread,
          sourceType: thread.source_type,
        };
      }),
    [activeThreadId, threadRows],
  );

  const unreadCount = useMemo(
    () => threads.filter((thread) => thread.isUnread).length,
    [threads],
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

  const markRead = useCallback(async (id: string) => {
    const queryKey = clientId ? threadKeys.list(clientId) : null;
    const optimisticLastReadAt = new Date().toISOString();
    const previousThreads = queryKey
      ? queryClient.getQueryData<ThreadRow[]>(queryKey)
      : undefined;

    if (queryKey) {
      queryClient.setQueryData<ThreadRow[]>(
        queryKey,
        (currentThreads) =>
          currentThreads?.map((thread) =>
            thread.thread_id === id
              ? { ...thread, last_read_at: optimisticLastReadAt }
              : thread
          ) ?? currentThreads,
      );
    }

    try {
      await markThreadReadMutateAsync({
        threadId: id,
        lastReadAt: optimisticLastReadAt,
      });
    } catch {
      if (queryKey) {
        queryClient.setQueryData<ThreadRow[]>(
          queryKey,
          (currentThreads) => {
            const currentThread = currentThreads?.find((thread) => thread.thread_id === id);
            if (!currentThread || currentThread.last_read_at !== optimisticLastReadAt) {
              return currentThreads;
            }

            return previousThreads;
          },
        );
      }
    }
  }, [clientId, markThreadReadMutateAsync, queryClient]);

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }

    const activeThread = threadRows.find((thread) => thread.thread_id === activeThreadId);
    if (!activeThread) {
      return;
    }

    if (!hasUnreadActivity(activeThread.updated_at, activeThread.last_read_at)) {
      return;
    }

    const attemptKey = `${activeThread.updated_at}:${activeThread.last_read_at ?? "null"}`;
    if (lastMarkReadAttemptKeyByThreadIdRef.current[activeThreadId] === attemptKey) {
      return;
    }

    lastMarkReadAttemptKeyByThreadIdRef.current[activeThreadId] = attemptKey;
    void markRead(activeThreadId);
  }, [activeThreadId, markRead, threadRows]);

  const value = useMemo<ThreadContextValue>(
    () => ({
      threads,
      isLoading: isThreadsLoading,
      unreadCount,
      createThread,
      updateThreadTitle,
      archiveThread,
      markRead,
    }),
    [threads, isThreadsLoading, unreadCount, createThread, updateThreadTitle, archiveThread, markRead],
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
