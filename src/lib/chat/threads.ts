/**
 * Data access helpers for conversation thread persistence.
 * @module lib/chat/threads
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type ChatSupabaseClient = SupabaseClient<Database>;
type ThreadRow = Database["public"]["Tables"]["conversation_threads"]["Row"];

/**
 * Prevents mutations against pinned system threads before issuing the write.
 * This keeps the UI and runner aligned with the autopilot-thread invariant even
 * if a caller bypasses the sidebar affordances.
 */
async function ensureThreadIsMutable(
  supabase: ChatSupabaseClient,
  threadId: string,
  action: "archived" | "renamed",
): Promise<void> {
  const { data, error } = await supabase
    .from("conversation_threads")
    .select("thread_id, is_pinned")
    .eq("thread_id", threadId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Thread not found");
  }

  if (data.is_pinned) {
    throw new Error(`Pinned threads cannot be ${action}`);
  }
}

/**
 * Lists visible threads for a client, keeping the primary thread first.
 */
export async function listThreads(supabase: ChatSupabaseClient, clientId: string): Promise<ThreadRow[]> {
  const { data, error } = await supabase
    .from("conversation_threads")
    .select("*")
    .eq("client_id", clientId)
    .eq("is_archived", false)
    .order("is_primary", { ascending: false })
    .order("is_pinned", { ascending: false })
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
  supabase: ChatSupabaseClient,
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
export async function getThread(supabase: ChatSupabaseClient, threadId: string): Promise<ThreadRow> {
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
 * Loads the primary thread for a client, or null if none exists.
 */
export async function getPrimaryThread(
  supabase: ChatSupabaseClient,
  clientId: string,
): Promise<ThreadRow | null> {
  const { data, error } = await supabase
    .from("conversation_threads")
    .select("*")
    .eq("client_id", clientId)
    .eq("is_primary", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Archives a thread (soft-delete).
 */
export async function archiveThread(
  supabase: ChatSupabaseClient,
  threadId: string,
): Promise<ThreadRow> {
  await ensureThreadIsMutable(supabase, threadId, "archived");

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
  supabase: ChatSupabaseClient,
  threadId: string,
  title: string,
): Promise<ThreadRow> {
  await ensureThreadIsMutable(supabase, threadId, "renamed");

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
