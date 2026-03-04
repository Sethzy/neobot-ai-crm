/**
 * Data access helpers for channel/thread mapping and inbound idempotency.
 * @module lib/chat/channel-routing
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type ChatSupabaseClient = SupabaseClient<Database>;

/** Supported messaging channels. Must match the CHECK constraint on the DB tables. */
export type Channel = "web" | "telegram" | "whatsapp";

export interface ExternalConversationScope {
  clientId: string;
  channel: Channel;
  externalConversationId: string;
}

export interface ExternalConversationMapping extends ExternalConversationScope {
  threadId: string;
}

export interface DeliveryReceiptInput {
  clientId: string;
  channel: Channel;
  deliveryId: string;
  threadId: string;
}

/**
 * Resolves a mapped internal thread for an external channel conversation.
 */
export async function getThreadIdForExternalConversation(
  supabase: ChatSupabaseClient,
  scope: ExternalConversationScope,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("conversation_channel_mappings")
    .select("thread_id")
    .eq("client_id", scope.clientId)
    .eq("channel", scope.channel)
    .eq("external_conversation_id", scope.externalConversationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve channel mapping: ${error.message}`);
  }

  return data?.thread_id ?? null;
}

/**
 * Atomically ensures a mapping exists for an external conversation.
 * Uses INSERT ON CONFLICT DO NOTHING (via unique constraint) + readback.
 * First-write-wins: if a mapping already exists, returns the existing thread_id
 * without overwriting. This is Dorabot's proven atomic pattern.
 */
export async function ensureExternalConversationMapping(
  supabase: ChatSupabaseClient,
  mapping: ExternalConversationMapping,
): Promise<string> {
  const { error: insertError } = await supabase
    .from("conversation_channel_mappings")
    .insert({
      client_id: mapping.clientId,
      channel: mapping.channel,
      external_conversation_id: mapping.externalConversationId,
      thread_id: mapping.threadId,
    });

  if (insertError && insertError.code !== "23505") {
    throw new Error(`Failed to ensure channel mapping: ${insertError.message}`);
  }

  const { data, error: selectError } = await supabase
    .from("conversation_channel_mappings")
    .select("thread_id")
    .eq("client_id", mapping.clientId)
    .eq("channel", mapping.channel)
    .eq("external_conversation_id", mapping.externalConversationId)
    .maybeSingle();

  if (selectError || !data) {
    throw new Error(
      `Failed to read channel mapping after ensure: ${selectError?.message ?? "not found"}`,
    );
  }

  return data.thread_id;
}

/**
 * Records one inbound delivery id. Returns false when the delivery was already seen.
 */
export async function recordInboundDelivery(
  supabase: ChatSupabaseClient,
  input: DeliveryReceiptInput,
): Promise<boolean> {
  const { error } = await supabase.from("conversation_channel_delivery_receipts").insert({
    client_id: input.clientId,
    channel: input.channel,
    delivery_id: input.deliveryId,
    thread_id: input.threadId,
  });

  if (!error) {
    return true;
  }

  if (error.code === "23505") {
    return false;
  }

  throw new Error(`Failed to record inbound delivery: ${error.message}`);
}
