/**
 * Data access helpers for thread-level queueing.
 * @module lib/runner/thread-queue
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database";

type ChatSupabaseClient = SupabaseClient<Database>;

export interface EnqueueMessageInput {
  threadId: string;
  clientId: string;
  content: string;
  channel?: string;
}

export interface QueueScope {
  threadId: string;
  clientId: string;
}

interface DrainedQueueRow {
  queue_id: string;
  content: Json;
  created_at: string;
}

function extractText(content: Json): string {
  if (typeof content === "string") {
    return content;
  }

  if (typeof content === "object" && content && "text" in content && typeof content.text === "string") {
    return content.text;
  }

  return JSON.stringify(content);
}

/**
 * Inserts one queued message record for a busy thread.
 */
export async function enqueueMessage(
  supabase: ChatSupabaseClient,
  { threadId, clientId, content, channel = "web" }: EnqueueMessageInput,
): Promise<void> {
  const { error } = await supabase.from("thread_queue_records").insert({
    thread_id: threadId,
    client_id: clientId,
    channel,
    content: { text: content },
  });

  if (error) {
    throw new Error(`Failed to enqueue message: ${error.message}`);
  }
}

/**
 * Atomically drains queue rows and returns plain-text payloads in order.
 */
export async function drainQueue(
  supabase: ChatSupabaseClient,
  { threadId, clientId }: QueueScope,
): Promise<string[]> {
  const { data, error } = await supabase.rpc("drain_thread_queue", {
    p_thread_id: threadId,
    p_client_id: clientId,
  });

  if (error) {
    throw new Error(`Failed to drain queue: ${error.message}`);
  }

  const rows = (data as DrainedQueueRow[] | null) ?? [];
  return rows.map((row) => extractText(row.content));
}

/**
 * Fast existence check for pending queue rows.
 */
export async function hasQueuedMessages(
  supabase: ChatSupabaseClient,
  { threadId, clientId }: QueueScope,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("thread_queue_records")
    .select("queue_id")
    .eq("thread_id", threadId)
    .eq("client_id", clientId)
    .limit(1);

  if (error) {
    throw new Error(`Failed to check queue: ${error.message}`);
  }

  return (data?.length ?? 0) > 0;
}
