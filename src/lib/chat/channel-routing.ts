/**
 * Data access helpers for channel/thread mapping and inbound idempotency.
 * @module lib/chat/channel-routing
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type ChatSupabaseClient = SupabaseClient<Database>;

export interface ExternalConversationScope {
  clientId: string;
  channel: string;
  externalConversationId: string;
}

export interface ExternalConversationMapping extends ExternalConversationScope {
  threadId: string;
}

export interface DeliveryReceiptInput {
  clientId: string;
  channel: string;
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
 * Creates or updates an external conversation mapping to the canonical thread id.
 */
export async function upsertExternalConversationThreadMap(
  supabase: ChatSupabaseClient,
  mapping: ExternalConversationMapping,
): Promise<void> {
  const { data: existing, error: existingError } = await supabase
    .from("conversation_channel_mappings")
    .select("mapping_id, thread_id")
    .eq("client_id", mapping.clientId)
    .eq("channel", mapping.channel)
    .eq("external_conversation_id", mapping.externalConversationId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to check channel mapping: ${existingError.message}`);
  }

  if (!existing) {
    const { error: insertError } = await supabase
      .from("conversation_channel_mappings")
      .insert({
        client_id: mapping.clientId,
        channel: mapping.channel,
        external_conversation_id: mapping.externalConversationId,
        thread_id: mapping.threadId,
      });

    if (insertError) {
      throw new Error(`Failed to create channel mapping: ${insertError.message}`);
    }
    return;
  }

  if (existing.thread_id === mapping.threadId) {
    return;
  }

  const { error: updateError } = await supabase
    .from("conversation_channel_mappings")
    .update({
      thread_id: mapping.threadId,
    })
    .eq("mapping_id", existing.mapping_id);

  if (updateError) {
    throw new Error(`Failed to update channel mapping: ${updateError.message}`);
  }
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
