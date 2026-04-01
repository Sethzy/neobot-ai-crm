/**
 * Data access helpers for conversation message persistence.
 * @module lib/chat/messages
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database";

type ChatSupabaseClient = SupabaseClient<Database>;
type MessageRow = Database["public"]["Tables"]["conversation_messages"]["Row"];
type MessageInsert = Database["public"]["Tables"]["conversation_messages"]["Insert"];

export interface CreateMessageInput {
  thread_id: string;
  role: MessageInsert["role"];
  content?: string | null;
  parts?: Json;
}

/**
 * Lists messages for a thread ordered chronologically.
 */
export async function listMessages(
  supabase: ChatSupabaseClient,
  threadId: string,
): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from("conversation_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

/**
 * Persists one message row.
 */
export async function createMessage(
  supabase: ChatSupabaseClient,
  message: CreateMessageInput,
): Promise<MessageRow> {
  const { data, error } = await supabase
    .from("conversation_messages")
    .insert(message)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create message");
  }

  return data;
}

/**
 * Persists multiple message rows in one insert.
 * Pre-generates `message_id` so a retry after a transient fetch failure
 * can use upsert (ON CONFLICT DO NOTHING) to avoid duplicates.
 */
export async function createMessages(
  supabase: ChatSupabaseClient,
  messages: CreateMessageInput[],
): Promise<MessageRow[]> {
  if (messages.length === 0) {
    return [];
  }

  const messagesWithIds = messages.map((m) => ({
    ...m,
    message_id: crypto.randomUUID(),
  }));

  const { data, error } = await supabase
    .from("conversation_messages")
    .insert(messagesWithIds)
    .select("*");

  // Retry once on transient network failures. Uses upsert with ignoreDuplicates
  // in case the first insert succeeded but the response was lost.
  if (error?.message?.includes("fetch failed")) {
    const { data: retryData, error: retryError } = await supabase
      .from("conversation_messages")
      .upsert(messagesWithIds, { onConflict: "message_id", ignoreDuplicates: true })
      .select("*");

    if (retryError) {
      throw new Error(retryError.message);
    }

    return retryData ?? [];
  }

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}
