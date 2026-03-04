/**
 * TanStack Query hooks for conversation thread persistence.
 * @module hooks/use-threads
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useRealtimeTable } from "@/hooks/use-realtime";
import { archiveThread, createThread, listThreads, updateThreadTitle } from "@/lib/chat/threads";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

type ThreadRow = Database["public"]["Tables"]["conversation_threads"]["Row"];

export const threadKeys = {
  all: ["threads"] as const,
  list: (clientId: string) => ["threads", "list", clientId] as const,
};

/**
 * Lists threads for a resolved client id.
 */
export function useThreads(clientId: string | null | undefined) {
  useRealtimeTable({
    table: "conversation_threads",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [threadKeys.list(clientId ?? "")],
    enabled: Boolean(clientId),
  });

  return useQuery({
    queryKey: threadKeys.list(clientId ?? ""),
    queryFn: () => listThreads(supabase, clientId as string),
    enabled: Boolean(clientId),
  });
}

/**
 * Creates a thread and invalidates the thread list cache.
 */
export function useCreateThread(clientId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (title: string | null = null): Promise<ThreadRow> => {
      if (!clientId) {
        throw new Error("Cannot create thread: client_id not resolved");
      }

      return createThread(supabase, clientId, title);
    },
    onSuccess: () => {
      if (clientId) {
        queryClient.invalidateQueries({ queryKey: threadKeys.list(clientId) });
      }
    },
  });
}

/**
 * Archives a thread and invalidates the thread list cache.
 */
export function useArchiveThread(clientId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (threadId: string): Promise<ThreadRow> =>
      archiveThread(supabase, threadId),
    onSuccess: () => {
      if (clientId) {
        queryClient.invalidateQueries({ queryKey: threadKeys.list(clientId) });
      }
    },
  });
}

/**
 * Updates thread title and invalidates thread list cache.
 */
export function useUpdateThreadTitle(clientId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      threadId,
      title,
    }: {
      threadId: string;
      title: string;
    }): Promise<ThreadRow> => updateThreadTitle(supabase, threadId, title),
    onSuccess: () => {
      if (clientId) {
        queryClient.invalidateQueries({ queryKey: threadKeys.list(clientId) });
      }
    },
  });
}
