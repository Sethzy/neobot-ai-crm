/**
 * Data access helpers for thread-level queueing.
 * @module lib/runner/thread-queue
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { allowedModelIds } from "@/lib/ai/models";
import {
  type RunnerFilePart,
  runnerChannelValues,
  runnerFilePartSchema,
  triggerTypeValues,
} from "@/lib/runner/schemas";
import type { Database, Json } from "@/types/database";

type ChatSupabaseClient = SupabaseClient<Database>;
type QueuedTriggerType = (typeof triggerTypeValues)[number];
type QueuedChannel = (typeof runnerChannelValues)[number];

export interface EnqueueMessageInput {
  threadId: string;
  clientId: string;
  content: string;
  fileParts?: RunnerFilePart[];
  channel?: QueuedChannel;
  triggerType?: QueuedTriggerType;
  selectedChatModel?: string;
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

export interface DrainedQueuedMessage {
  text: string;
  triggerType: QueuedTriggerType;
  channel?: QueuedChannel;
  fileParts?: RunnerFilePart[];
  selectedChatModel?: string;
}

function isQueuedTriggerType(value: unknown): value is QueuedTriggerType {
  return triggerTypeValues.includes(value as QueuedTriggerType);
}

function parseQueuedFileParts(value: unknown): RunnerFilePart[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const parsed = runnerFilePartSchema.array().safeParse(value);
  return parsed.success && parsed.data.length > 0 ? parsed.data : undefined;
}

function isQueuedChannel(value: unknown): value is QueuedChannel {
  return runnerChannelValues.includes(value as QueuedChannel);
}

function parseQueuedSelectedChatModel(value: unknown): string | undefined {
  return typeof value === "string" && allowedModelIds.has(value) ? value : undefined;
}

function extractQueuedMessage(content: Json): DrainedQueuedMessage {
  if (typeof content === "string") {
    return {
      text: content,
      triggerType: "chat",
    };
  }

  if (typeof content === "object" && content && "text" in content && typeof content.text === "string") {
    return {
      text: content.text,
      triggerType: isQueuedTriggerType(content.triggerType) ? content.triggerType : "chat",
      channel: isQueuedChannel(content.channel) ? content.channel : undefined,
      fileParts: parseQueuedFileParts(content.fileParts),
      selectedChatModel: parseQueuedSelectedChatModel(content.selectedChatModel),
    };
  }

  return {
    text: JSON.stringify(content),
    triggerType: "chat",
  };
}

/**
 * Inserts one queued message record for a busy thread.
 */
export async function enqueueMessage(
  supabase: ChatSupabaseClient,
  {
    threadId,
    clientId,
    content,
    fileParts,
    channel = "web",
    triggerType,
    selectedChatModel,
  }: EnqueueMessageInput,
): Promise<void> {
  const { error } = await supabase.from("thread_queue_records").insert({
    thread_id: threadId,
    client_id: clientId,
    channel,
    content: {
      text: content,
      channel,
      ...(triggerType && triggerType !== "chat" ? { triggerType } : {}),
      ...(fileParts && fileParts.length > 0 ? { fileParts } : {}),
      ...(selectedChatModel ? { selectedChatModel } : {}),
    },
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
): Promise<DrainedQueuedMessage[]> {
  const { data, error } = await supabase.rpc("drain_thread_queue", {
    p_thread_id: threadId,
    p_client_id: clientId,
  });

  if (error) {
    throw new Error(`Failed to drain queue: ${error.message}`);
  }

  const rows = (data as DrainedQueueRow[] | null) ?? [];
  return rows.map((row) => extractQueuedMessage(row.content));
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
