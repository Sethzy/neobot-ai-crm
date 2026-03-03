/**
 * TanStack Query hooks for conversation message persistence.
 * @module hooks/use-chat-messages
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useRealtimeTable } from "@/hooks/use-realtime";
import { createMessages, listMessages } from "@/lib/chat/messages";
import { supabase } from "@/lib/supabase";
import type { Database, Json } from "@/types/database";

type MessageRow = Database["public"]["Tables"]["conversation_messages"]["Row"];
type MessageRole = Database["public"]["Tables"]["conversation_messages"]["Insert"]["role"];

export interface SaveMessageInput {
  role: MessageRole;
  content?: string | null;
  parts?: Json;
}

export const messageKeys = {
  all: ["messages"] as const,
  byThread: (threadId: string) => ["messages", "thread", threadId] as const,
};

/**
 * Fetches persisted messages for a thread.
 */
export function useChatMessages(threadId: string | null | undefined) {
  useRealtimeTable({
    table: "conversation_messages",
    filter: threadId ? `thread_id=eq.${threadId}` : undefined,
    queryKeys: [messageKeys.byThread(threadId ?? "")],
    enabled: Boolean(threadId),
  });

  return useQuery({
    queryKey: messageKeys.byThread(threadId ?? ""),
    queryFn: () => listMessages(supabase, threadId as string),
    enabled: Boolean(threadId),
  });
}

/**
 * Persists a message batch and invalidates message cache for the thread.
 */
export function useSaveMessages(threadId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messages: SaveMessageInput[]): Promise<MessageRow[]> => {
      if (!threadId) {
        throw new Error("Cannot save messages: thread_id not resolved");
      }

      return createMessages(
        supabase,
        messages.map((message) => ({
          thread_id: threadId,
          role: message.role,
          content: message.content ?? null,
          parts: message.parts ?? null,
        })),
      );
    },
    onSuccess: () => {
      if (threadId) {
        queryClient.invalidateQueries({ queryKey: messageKeys.byThread(threadId) });
      }
    },
  });
}
