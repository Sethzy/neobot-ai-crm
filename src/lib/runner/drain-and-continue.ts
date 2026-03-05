/**
 * Queue drain helper that starts follow-up runs for queued messages.
 * @module lib/runner/drain-and-continue
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { runAgent } from "@/lib/runner/run-agent";
import { drainQueue } from "@/lib/runner/thread-queue";
import type { Database } from "@/types/database";

interface DrainAndContinueInput {
  clientId: string;
  threadId: string;
}

type ChatSupabaseClient = SupabaseClient<Database>;

function buildQueuedInput(messages: string[]): string {
  if (messages.length <= 1) {
    return messages[0] ?? "";
  }

  const numbered = messages.map((message, index) => `${index + 1}. ${message}`).join("\n");
  return `Messages received while processing:\n${numbered}`;
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

  await runAgent(
    {
      clientId,
      threadId,
      triggerType: "chat",
      input: buildQueuedInput(queuedMessages),
    },
    supabase,
  );
}
