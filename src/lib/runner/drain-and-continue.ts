/**
 * Queue drain helper that starts follow-up runs for queued messages.
 * @module lib/runner/drain-and-continue
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { runAgent } from "@/lib/runner/run-agent";
import {
  drainQueue,
  enqueueMessage,
  type DrainedQueuedMessage,
} from "@/lib/runner/thread-queue";
import type { Database } from "@/types/database";

interface DrainAndContinueInput {
  clientId: string;
  threadId: string;
}

type ChatSupabaseClient = SupabaseClient<Database>;

function buildQueuedInput(messages: DrainedQueuedMessage[]): string {
  if (messages.length <= 1) {
    return messages[0]?.text ?? "";
  }

  const numbered = messages.map((message, index) => `${index + 1}. ${message.text}`).join("\n");
  return `Messages received while processing:\n${numbered}`;
}

function splitQueuedMessages(messages: DrainedQueuedMessage[]): {
  nextBatch: DrainedQueuedMessage[];
  remaining: DrainedQueuedMessage[];
} {
  const firstMessage = messages[0];
  if (!firstMessage) {
    return {
      nextBatch: [],
      remaining: [],
    };
  }

  if (firstMessage.triggerType !== "chat") {
    return {
      nextBatch: [firstMessage],
      remaining: messages.slice(1),
    };
  }

  if (firstMessage.fileParts && firstMessage.fileParts.length > 0) {
    return {
      nextBatch: [firstMessage],
      remaining: messages.slice(1),
    };
  }

  let nextIndex = 1;
  while (true) {
    const nextMessage = messages[nextIndex];
    if (!nextMessage || nextMessage.triggerType !== "chat") {
      break;
    }

    if (nextMessage.fileParts && nextMessage.fileParts.length > 0) {
      break;
    }

    nextIndex += 1;
  }

  return {
    nextBatch: messages.slice(0, nextIndex),
    remaining: messages.slice(nextIndex),
  };
}

/**
 * Drains queue rows for one thread and starts another run when payload exists.
 */
export async function drainAndContinue(
  supabase: ChatSupabaseClient,
  { clientId, threadId }: DrainAndContinueInput,
): Promise<void> {
  const queuedMessages = await drainQueue(supabase, { threadId, clientId });
  if (queuedMessages.length === 0) {
    return;
  }

  const { nextBatch, remaining } = splitQueuedMessages(queuedMessages);

  for (const queuedMessage of remaining) {
    await enqueueMessage(supabase, {
      threadId,
      clientId,
      content: queuedMessage.text,
      fileParts: queuedMessage.fileParts,
      triggerType: queuedMessage.triggerType,
    });
  }

  const firstQueuedMessage = nextBatch[0];
  if (!firstQueuedMessage) {
    return;
  }

  await runAgent(
    {
      clientId,
      threadId,
      triggerType: firstQueuedMessage.triggerType,
      input: firstQueuedMessage.triggerType === "chat"
        ? buildQueuedInput(nextBatch)
        : firstQueuedMessage.text,
      ...(firstQueuedMessage.fileParts ? { fileParts: firstQueuedMessage.fileParts } : {}),
    },
    supabase,
  );
}
