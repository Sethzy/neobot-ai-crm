/**
 * Chat adapter — thin wrapper over `consumeAnthropicSession`.
 *
 * Responsibilities (everything else lives in the session runner):
 *   1. Acquire the per-thread run lock via `createRun` (after sweeping
 *      stale rows with `markStaleRunsFailed`).
 *   2. Create or reuse the Anthropic session for the thread.
 *   3. Build the kickoff text from profile + preferences + system reminder
 *      + the user's input.
 *   4. Wire the runner's `SessionRunnerCallbacks` into a `UIMessageStream`
 *      writer so the browser sees text-deltas, tool-calls, tool-results,
 *      and approval requests in real time.
 *   5. On terminal:
 *        - end_turn → persist assistant message + completeRun + evaluators
 *        - retries_exhausted / terminated → completeRun(failed)
 *        - requires_action → persist partial assistant message and exit;
 *          H4's approval-resolution path owns the eventual completion.
 *   6. Wrap the outer stream in `pipeJsonRender` so spec fences inside
 *      streamed text become first-class data-spec parts (D3).
 *
 * @module lib/managed-agents/adapter
 */
import type Anthropic from "@anthropic-ai/sdk";
import { createUIMessageStream } from "ai";
import { pipeJsonRender } from "@json-render/core";

import { upsertMessage } from "@/lib/chat/messages";
import { runEvaluatorsForEvents } from "@/lib/eval/run-evaluators";
import {
  completeRun,
  createRun,
  markStaleRunsFailed,
} from "@/lib/runner/run-lifecycle";
import { buildSystemReminder } from "@/lib/runner/system-reminder";
import type { Json } from "@/types/database";

import { computeTurnCost } from "./adapter-cost";
import { buildAssistantPartsFromEvents } from "./events-to-assistant-parts";
import { buildKickoffText, getOrCreateSession } from "./session-kickoff";
import { consumeAnthropicSession } from "./session-runner";
import type { ManagedSupabaseClient } from "./types";

import type { AnthropicEvent } from "./event-types";

/**
 * Pick a stable per-turn idempotency key from the accumulated events.
 *
 * Prefers the last terminal event (session.status_idle / status_terminated)
 * because that uniquely identifies the end of the turn — re-runs of the
 * same session will see the same terminal id and the upsertMessage call
 * becomes a no-op. Falls back to the last event id of any kind, then to
 * a synthetic `run:<runId>` key, so the adapter never writes a row
 * without a source_event_id (the unique index on conversation_messages
 * is NOT NULL on this column for managed-agents writes by convention).
 */
function pickSourceEventId(
  events: ReadonlyArray<AnthropicEvent>,
  runId: string,
): string {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i] as { id?: string; type?: string };
    if (
      e.type === "session.status_idle" ||
      e.type === "session.status_terminated"
    ) {
      if (typeof e.id === "string" && e.id.length > 0) return e.id;
    }
  }
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i] as { id?: string };
    if (typeof e.id === "string" && e.id.length > 0) return e.id;
  }
  return `run:${runId}`;
}

export interface RunManagedAgentInput {
  anthropic: Anthropic;
  supabase: ManagedSupabaseClient;
  clientId: string;
  threadId: string;
  input: string;
  clientProfile: string | null;
  userPreferences: string | null;
  threadTitle: string | null;
}

export async function runManagedAgent(
  input: RunManagedAgentInput,
): Promise<ReadableStream<unknown>> {
  await markStaleRunsFailed(input.supabase, { threadId: input.threadId });
  const lock = await createRun(input.supabase, {
    threadId: input.threadId,
    clientId: input.clientId,
    runType: "chat",
  });
  if (!lock.created) {
    throw new Error(
      "Another run is active on this thread — queueing is H4 scope.",
    );
  }
  const runId = lock.runId;

  const session = await getOrCreateSession({
    anthropic: input.anthropic,
    supabase: input.supabase,
    threadId: input.threadId,
    threadTitle: input.threadTitle,
  });

  const reminder = await buildSystemReminder(
    input.supabase,
    input.clientId,
    input.threadId,
  );
  const kickoff = buildKickoffText({
    clientProfile: input.clientProfile,
    userPreferences: input.userPreferences,
    systemReminder: reminder,
    userMessage: input.input,
  });

  const rawStream = createUIMessageStream({
    execute: async ({ writer }) => {
      try {
      const result = await consumeAnthropicSession({
        anthropic: input.anthropic,
        sessionId: session.id,
        runId,
        context: {
          supabase: input.supabase,
          clientId: input.clientId,
          threadId: input.threadId,
          isChatContext: true,
        },
        kickoffMessage: kickoff,
        persistIncrementally: true,
        autoDenyApprovals: false,
        callbacks: {
          onSpanModelRequestStart: () => {
            writer.write({ type: "start-step" } as never);
          },
          onAgentMessage: (event) => {
            const e = event as { content: Array<{ type: string; text?: string }> };
            for (const block of e.content) {
              if (block.type === "text" && typeof block.text === "string") {
                writer.write({ type: "text-delta", delta: block.text } as never);
              }
            }
          },
          onAgentToolUse: (event) => {
            const e = event as { id: string; name: string; input: unknown };
            writer.write({
              type: "tool-call",
              toolCallId: e.id,
              toolName: e.name,
              input: e.input,
            } as never);
          },
          onAgentToolResult: (event) => {
            const e = event as {
              custom_tool_use_id: string;
              content: Array<{ text: string }>;
            };
            let parsed: unknown;
            try {
              parsed = JSON.parse(e.content[0]?.text ?? "null");
            } catch {
              parsed = e.content[0]?.text ?? null;
            }
            writer.write({
              type: "tool-result",
              toolCallId: e.custom_tool_use_id,
              result: parsed,
            } as never);
          },
          onApprovalRequired: (event, approvalId) => {
            const e = event as { id: string; name: string; input: unknown };
            writer.write({
              type: "tool-approval-request",
              approvalId,
              toolCall: { toolCallId: e.id, toolName: e.name, input: e.input },
            } as never);
          },
          onSessionError: (event) => {
            const e = event as { error?: { message?: string } };
            writer.write({
              type: "error",
              message: e.error?.message ?? "Session error",
            } as never);
          },
        },
      });

      // ── Finalization ────────────────────────────────────────────────
      const accumulatedEvents = result.accumulatedEvents as ReadonlyArray<AnthropicEvent>;
      const sourceEventId = pickSourceEventId(accumulatedEvents, runId);

      if (result.status === "complete" && result.reason === "end_turn") {
        const parts = buildAssistantPartsFromEvents(accumulatedEvents);
        if (parts.some((p) => p.type !== "step-start")) {
          await upsertMessage(input.supabase, {
            thread_id: input.threadId,
            role: "assistant",
            content: null,
            parts: parts as unknown as Json,
            source_event_id: sourceEventId,
          });
        }
        const costUsd = computeTurnCost({
          inputTokens: result.cost.inputTokens,
          outputTokens: result.cost.outputTokens,
          cacheReadInputTokens: result.cost.cacheReadInputTokens,
          cacheCreationInputTokens: result.cost.cacheCreationInputTokens,
          activeSeconds: result.cost.runtimeSeconds,
        });
        await completeRun(input.supabase, {
          runId,
          status: "completed",
          model: "claude-sonnet-4-6",
          tokensIn: result.cost.inputTokens,
          tokensOut: result.cost.outputTokens,
          costUsd,
        });
        await runEvaluatorsForEvents(accumulatedEvents, runId, input.supabase, {
          conversationInput: input.input,
        });
      } else if (result.reason === "requires_action") {
        // Paused on approval — persist whatever we streamed (including
        // the approval-requested part so reload renders the prompt) but
        // do NOT mark the run complete. The chat UI / Telegram callback
        // will resolve the approval and re-enter the session in H4.
        const parts = buildAssistantPartsFromEvents(accumulatedEvents);
        if (parts.some((p) => p.type !== "step-start")) {
          await upsertMessage(input.supabase, {
            thread_id: input.threadId,
            role: "assistant",
            content: null,
            parts: parts as unknown as Json,
            source_event_id: sourceEventId,
          });
        }
      } else {
        await completeRun(input.supabase, {
          runId,
          status: "failed",
          model: "claude-sonnet-4-6",
          tokensIn: result.cost.inputTokens,
          tokensOut: result.cost.outputTokens,
        });
      }
      } catch (error) {
        // Anything thrown after createRun() but before the run is
        // marked complete leaves the row stuck in `running` until
        // markStaleRunsFailed sweeps it. Mark failed eagerly so the
        // thread isn't locked, then re-throw so the UIMessageStream
        // surfaces the error to the consumer.
        try {
          await completeRun(input.supabase, {
            runId,
            status: "failed",
            model: "claude-sonnet-4-6",
            tokensIn: 0,
            tokensOut: 0,
          });
        } catch (cleanupError) {
          console.error(
            "[runManagedAgent] failed to mark run as failed during cleanup",
            cleanupError,
          );
        }
        throw error;
      }
    },
  });

  return pipeJsonRender(rawStream) as ReadableStream<unknown>;
}
