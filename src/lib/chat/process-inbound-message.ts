/**
 * Shared inbound message orchestration for web and future channel adapters.
 * @module lib/chat/process-inbound-message
 */
import { z } from "zod";

import type { Channel } from "@/lib/chat/channel-routing";
import {
  ensureExternalConversationMapping,
  getThreadIdForExternalConversation,
  recordInboundDelivery,
} from "@/lib/chat/channel-routing";
import { createThread } from "@/lib/chat/threads";
import { runAgent } from "@/lib/runner/run-agent";
import type { RunnerPayload } from "@/lib/runner/schemas";
import type { AppSupabaseClient } from "@/lib/supabase/types";

const threadIdSchema = z.string().uuid();

export interface ProcessInboundMessageInput {
  supabase: AppSupabaseClient;
  clientId: string;
  channel: Channel;
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
  supabase: AppSupabaseClient,
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

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("Unknown inbound lookup failure.");
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
  const validRequestedThreadId =
    requestedThreadId && threadIdSchema.safeParse(requestedThreadId).success
      ? requestedThreadId
      : null;

  const [mappedLookup, requestedLookup] = await Promise.allSettled([
    getThreadIdForExternalConversation(supabase, {
      clientId,
      channel,
      externalConversationId,
    }),
    validRequestedThreadId
      ? findActiveThreadForClient(supabase, clientId, validRequestedThreadId)
      : Promise.resolve(null),
  ]);

  const mappedThreadId = mappedLookup.status === "fulfilled" ? mappedLookup.value : null;
  const requestedActiveThreadId = requestedLookup.status === "fulfilled" ? requestedLookup.value : null;

  let canonicalThreadId = mappedThreadId ?? requestedActiveThreadId;

  if (!canonicalThreadId) {
    if (mappedLookup.status === "rejected" && requestedLookup.status === "rejected") {
      throw toError(mappedLookup.reason);
    }

    if (mappedLookup.status === "rejected" && !requestedActiveThreadId) {
      throw toError(mappedLookup.reason);
    }

    if (requestedLookup.status === "rejected") {
      throw toError(requestedLookup.reason);
    }
  }

  if (!canonicalThreadId) {
    const createdThread = await createThread(supabase, clientId, messageText || null);
    canonicalThreadId = createdThread.thread_id;
  }

  canonicalThreadId = await ensureExternalConversationMapping(supabase, {
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
