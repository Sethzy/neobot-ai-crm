/**
 * Per-trigger listener task for Anthropic Managed Agents runs.
 *
 * This task is spawned by the trigger fire path after the session and
 * kickoff `user.message` already exist. It reuses the H3 session-runner
 * core with trigger-specific context: service-role Supabase, chat-only
 * tools disabled, and approval-gated tools auto-denied.
 *
 * @module src/trigger/run-trigger-agent
 */
import { logger, task } from "@trigger.dev/sdk/v3";

import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";
import {
  finalizeTriggerRun,
  persistTriggerRunSnapshot,
} from "@/lib/managed-agents/finalize-trigger-run";
import { consumeAnthropicSession } from "@/lib/managed-agents/session-runner";
import { createAdminClient } from "@/lib/supabase/server";

export interface RunTriggerAgentPayload {
  runId: string;
  sessionId: string;
  clientId: string;
  threadId: string;
}

export const runTriggerAgent = task({
  id: "run-trigger-agent",
  maxDuration: 3600,
  run: async (payload: RunTriggerAgentPayload) => {
    const supabase = await createAdminClient();
    const anthropic = getAnthropicClient();

    logger.info("Trigger run starting", {
      runId: payload.runId,
      sessionId: payload.sessionId,
      clientId: payload.clientId,
      threadId: payload.threadId,
    });

    const result = await consumeAnthropicSession({
      anthropic,
      sessionId: payload.sessionId,
      runId: payload.runId,
      context: {
        supabase,
        clientId: payload.clientId,
        threadId: payload.threadId,
        isChatContext: false,
      },
      autoDenyApprovals: true,
      persistIncrementally: true,
      callbacks: {
        onAccumulatedEventsUpdated: async (events) => {
          try {
            await persistTriggerRunSnapshot(supabase, {
              runId: payload.runId,
              threadId: payload.threadId,
              events,
            });
          } catch (error) {
            logger.error("Trigger snapshot persistence failed", {
              runId: payload.runId,
              threadId: payload.threadId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      },
      onTerminal: async (events, cost) => {
        await finalizeTriggerRun(supabase, {
          runId: payload.runId,
          threadId: payload.threadId,
          clientId: payload.clientId,
          sessionId: payload.sessionId,
          events,
          cost,
          anthropic,
        });
      },
    });

    logger.info("Trigger run completed", {
      runId: payload.runId,
      status: result.status,
      reason: result.reason,
    });

    return result;
  },
});
