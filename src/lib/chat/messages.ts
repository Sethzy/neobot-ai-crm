/**
 * Data access helpers for conversation message persistence.
 * @module lib/chat/messages
 */
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { Database, Json } from "@/types/database";

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
  supabase: AppSupabaseClient,
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
  supabase: AppSupabaseClient,
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
 */
export async function createMessages(
  supabase: AppSupabaseClient,
  messages: CreateMessageInput[],
): Promise<MessageRow[]> {
  if (messages.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("conversation_messages")
    .insert(messages)
    .select("*");

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}
