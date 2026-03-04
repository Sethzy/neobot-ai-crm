/**
 * Data access helpers for conversation thread persistence.
 * @module lib/chat/threads
 */
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { Database } from "@/types/database";

type ThreadRow = Database["public"]["Tables"]["conversation_threads"]["Row"];

/**
 * Lists threads for a client sorted by most recently updated first.
 */
export async function listThreads(supabase: AppSupabaseClient, clientId: string): Promise<ThreadRow[]> {
  const { data, error } = await supabase
    .from("conversation_threads")
    .select("*")
    .eq("client_id", clientId)
    .eq("is_archived", false)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

/**
 * Creates a new thread for the client.
 */
export async function createThread(
  supabase: AppSupabaseClient,
  clientId: string,
  title: string | null = null,
): Promise<ThreadRow> {
  const { data, error } = await supabase
    .from("conversation_threads")
    .insert({ client_id: clientId, title })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create thread");
  }

  return data;
}

/**
 * Loads one thread by primary key.
 */
export async function getThread(supabase: AppSupabaseClient, threadId: string): Promise<ThreadRow> {
  const { data, error } = await supabase
    .from("conversation_threads")
    .select("*")
    .eq("thread_id", threadId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Thread not found");
  }

  return data;
}

/**
 * Archives a thread (soft-delete).
 */
export async function archiveThread(
  supabase: AppSupabaseClient,
  threadId: string,
): Promise<ThreadRow> {
  const { data, error } = await supabase
    .from("conversation_threads")
    .update({ is_archived: true })
    .eq("thread_id", threadId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to archive thread");
  }

  return data;
}

/**
 * Updates the thread title.
 */
export async function updateThreadTitle(
  supabase: AppSupabaseClient,
  threadId: string,
  title: string,
): Promise<ThreadRow> {
  const { data, error } = await supabase
    .from("conversation_threads")
    .update({ title })
    .eq("thread_id", threadId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update thread title");
  }

  return data;
}
