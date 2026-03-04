/**
 * Shared inbound message orchestration for web and future channel adapters.
 * @module lib/chat/process-inbound-message
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  getThreadIdForExternalConversation,
  recordInboundDelivery,
  upsertExternalConversationThreadMap,
} from "@/lib/chat/channel-routing";
import { createThread } from "@/lib/chat/threads";
import { runAgent } from "@/lib/runner/run-agent";
import type { RunnerPayload } from "@/lib/runner/schemas";
import type { Database } from "@/types/database";

type ChatSupabaseClient = SupabaseClient<Database>;

const threadIdSchema = z.string().uuid();

export interface ProcessInboundMessageInput {
  supabase: ChatSupabaseClient;
  clientId: string;
  channel: string;
  externalConversationId: string;
  messageText: string;
  requestedThreadId?: string;
  deliveryId?: string;
  triggerType?: RunnerPayload["triggerType"];
}

export type ProcessInboundMessageResult =
  | { status: "streaming"; threadId: string; streamResult: Exclude<Awaited<ReturnType<typeof runAgent>>, { status: "queued" }>["streamResult"] }
  | { status: "queued"; threadId: string }
  | { status: "duplicate"; threadId: string };

async function findActiveThreadForClient(
  supabase: ChatSupabaseClient,
  clientId: string,
  threadId: string,
): Promise<string | null> {
  const { data: thread, error } = await supabase
    .from("conversation_threads")
    .select("thread_id")
    .eq("thread_id", threadId)
    .eq("client_id", clientId)
    .eq("is_archived", false)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve inbound thread: ${error.message}`);
  }

  return thread?.thread_id ?? null;
}

/**
 * Resolves the canonical thread, deduplicates inbound deliveries, and runs/queues the agent.
 */
export async function processInboundMessage({
  supabase,
  clientId,
  channel,
  externalConversationId,
  messageText,
  requestedThreadId,
  deliveryId,
  triggerType = "chat",
}: ProcessInboundMessageInput): Promise<ProcessInboundMessageResult> {
  let canonicalThreadId = await getThreadIdForExternalConversation(supabase, {
    clientId,
    channel,
    externalConversationId,
  });

  if (!canonicalThreadId && requestedThreadId && threadIdSchema.safeParse(requestedThreadId).success) {
    canonicalThreadId = await findActiveThreadForClient(supabase, clientId, requestedThreadId);
  }

  if (!canonicalThreadId) {
    const createdThread = await createThread(supabase, clientId, messageText || null);
    canonicalThreadId = createdThread.thread_id;
  }

  await upsertExternalConversationThreadMap(supabase, {
    clientId,
    channel,
    externalConversationId,
    threadId: canonicalThreadId,
  });

  if (deliveryId) {
    const isFreshDelivery = await recordInboundDelivery(supabase, {
      clientId,
      channel,
      deliveryId,
      threadId: canonicalThreadId,
    });

    if (!isFreshDelivery) {
      return { status: "duplicate", threadId: canonicalThreadId };
    }
  }

  const runResult = await runAgent(
    {
      clientId,
      threadId: canonicalThreadId,
      triggerType,
      input: messageText,
    },
    supabase,
  );

  if (runResult.status === "queued") {
    return { status: "queued", threadId: canonicalThreadId };
  }

  return {
    status: "streaming",
    threadId: canonicalThreadId,
    streamResult: runResult.streamResult,
  };
}
