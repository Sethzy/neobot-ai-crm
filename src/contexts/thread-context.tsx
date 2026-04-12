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
} from "react";
import posthog from "posthog-js";

import { useClientId } from "@/hooks/use-client-id";
import { buildAnalyticsContext } from "@/lib/analytics/posthog-context";
import { consumePendingPostHogAuthEvent } from "@/lib/analytics/posthog-auth-events";
import { supabase } from "@/lib/supabase";
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
      threadRows.map((thread) => ({
        id: thread.thread_id,
        title: thread.title ?? "New Chat",
        isPinned: thread.is_pinned,
        isPrimary: thread.is_primary,
        createdAt: new Date(thread.created_at),
        sourceType: thread.source_type,
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
