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
 *          the approval-resume path below owns the eventual completion.
 *   6. Wrap the outer stream in `pipeJsonRender` so spec fences inside
 *      streamed text become first-class data-spec parts (D3).
 *
 * Also exports `resumeManagedAgentFromApproval` — the post-approval
 * re-entry point used by `/api/chat`, `/api/tool-confirm`, and the
 * Telegram callback handler. It mirrors `runManagedAgent`'s finalization
 * shape but sends a `user.tool_confirmation` as its kickoff and reuses
 * the run_id recorded on the approval event instead of creating a new run.
 *
 * @module lib/managed-agents/adapter
 */
import type Anthropic from "@anthropic-ai/sdk";
import { createUIMessageStream, type UIMessageStreamWriter } from "ai";
import { pipeJsonRender } from "@json-render/core";

import { upsertMessage } from "@/lib/chat/messages";
import { deliverToExternalChannels } from "@/lib/channels/deliver";
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
import type {
  ManagedSupabaseClient,
  SessionRunnerCallbacks,
  SessionRunnerResult,
} from "./types";

import type { AnthropicEvent } from "./event-types";
import { getAssistantTextFromParts } from "@/lib/runner/message-utils";

const MANAGED_AGENT_MODEL = "claude-sonnet-4-6";

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

/**
 * Builds the `SessionRunnerCallbacks` that project raw Anthropic events
 * into UIMessageStream writes. Shared by the run + resume paths so browser
 * rendering stays identical whether we're on a fresh turn or a post-approval
 * continuation.
 */
function buildUiStreamCallbacks(
  writer: UIMessageStreamWriter,
): SessionRunnerCallbacks {
  return {
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
  };
}

interface FinalizeRunOptions {
  supabase: ManagedSupabaseClient;
  clientId: string;
  threadId: string;
  runId: string;
  result: SessionRunnerResult;
  /** Conversation input passed to evaluators. */
  conversationInput: string;
  /** Context label for log lines — "runManagedAgent" | "resumeManagedAgent". */
  logLabel: string;
}

/**
 * Persists the assistant message (end_turn / requires_action), completes
 * the run, and runs evaluators. Shared by the run + resume paths so both
 * terminal shapes behave identically.
 */
async function finalizeRun(options: FinalizeRunOptions): Promise<void> {
  const { supabase, clientId, threadId, runId, result, conversationInput, logLabel } = options;
  const accumulatedEvents = result.accumulatedEvents as ReadonlyArray<AnthropicEvent>;
  const sourceEventId = pickSourceEventId(accumulatedEvents, runId);

  if (result.status === "complete" && result.reason === "end_turn") {
    const parts = buildAssistantPartsFromEvents(accumulatedEvents);
    const contentText = getAssistantTextFromParts(parts);
    if (parts.some((p) => p.type !== "step-start")) {
      await upsertMessage(supabase, {
        thread_id: threadId,
        role: "assistant",
        content: contentText.length > 0 ? contentText : null,
        parts: parts as unknown as Json,
        source_event_id: sourceEventId,
      });
      await deliverToExternalChannels(
        supabase,
        threadId,
        clientId,
        contentText,
        parts,
      ).catch((deliveryError) => {
        console.error(
          `[${logLabel}] external channel delivery failed:`,
          deliveryError,
        );
      });
    }
    const costUsd = computeTurnCost({
      inputTokens: result.cost.inputTokens,
      outputTokens: result.cost.outputTokens,
      cacheReadInputTokens: result.cost.cacheReadInputTokens,
      cacheCreationInputTokens: result.cost.cacheCreationInputTokens,
      activeSeconds: result.cost.runtimeSeconds,
    });
    await completeRun(supabase, {
      runId,
      status: "completed",
      model: MANAGED_AGENT_MODEL,
      tokensIn: result.cost.inputTokens,
      tokensOut: result.cost.outputTokens,
      costUsd,
    });
    await runEvaluatorsForEvents(accumulatedEvents, runId, supabase, {
      conversationInput,
    });
    return;
  }

  if (result.reason === "requires_action") {
    // Paused on approval — persist whatever we streamed (including
    // the approval-requested part so reload renders the prompt) but
    // do NOT mark the run complete. The approval-resume path owns the
    // eventual completion.
    const parts = buildAssistantPartsFromEvents(accumulatedEvents);
    const contentText = getAssistantTextFromParts(parts);
    if (parts.some((p) => p.type !== "step-start")) {
      await upsertMessage(supabase, {
        thread_id: threadId,
        role: "assistant",
        content: contentText.length > 0 ? contentText : null,
        parts: parts as unknown as Json,
        source_event_id: sourceEventId,
      });
      await deliverToExternalChannels(
        supabase,
        threadId,
        clientId,
        contentText,
        parts,
      ).catch((deliveryError) => {
        console.error(
          `[${logLabel}] external channel delivery failed:`,
          deliveryError,
        );
      });
    }
    return;
  }

  // retries_exhausted / terminated / session_error → mark run failed.
  await completeRun(supabase, {
    runId,
    status: "failed",
    model: MANAGED_AGENT_MODEL,
    tokensIn: result.cost.inputTokens,
    tokensOut: result.cost.outputTokens,
  });
}

// ── runManagedAgent (fresh turn) ────────────────────────────────────────────

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

export type RunManagedAgentResult =
  | ReadableStream<unknown>
  | { status: "queued" };

export async function runManagedAgent(
  input: RunManagedAgentInput,
): Promise<RunManagedAgentResult> {
  await markStaleRunsFailed(input.supabase, { threadId: input.threadId });
  const lock = await createRun(input.supabase, {
    threadId: input.threadId,
    clientId: input.clientId,
    runType: "chat",
  });
  if (!lock.created) {
    // Thread is already running a turn. Signal the queued state to the
    // caller so `/api/chat` can surface a 409; do not throw — throwing
    // trips the `try { ... } catch { return 500 }` error path and swallows
    // the 409 contract.
    return { status: "queued" };
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
          autoDenyApprovals: false,
          callbacks: buildUiStreamCallbacks(writer),
        });

        await finalizeRun({
          supabase: input.supabase,
          clientId: input.clientId,
          threadId: input.threadId,
          runId,
          result,
          conversationInput: input.input,
          logLabel: "runManagedAgent",
        });
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
            model: MANAGED_AGENT_MODEL,
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

// ── resumeManagedAgentFromApproval (post-approval re-entry) ─────────────────

export interface ResumeManagedAgentFromApprovalInput {
  anthropic: Anthropic;
  supabase: ManagedSupabaseClient;
  clientId: string;
  approvalId: string;
  approved: boolean;
  denyMessage?: string;
}

export type ResumeManagedAgentResult =
  | {
      status: "streaming";
      stream: ReadableStream<unknown>;
      threadId: string;
    }
  | { status: "missing" }
  | { status: "already_resolved"; threadId: string }
  | { status: "error"; error: string };

/**
 * Re-enters a paused session after a user approves or denies a gated
 * tool call. Looks up `approval_events` for the session/tool_use/run ids,
 * kicks the session with a `user.tool_confirmation`, consumes the
 * post-approval events via the shared session runner, and finalizes the
 * run identically to `runManagedAgent` so the resumed turn is persisted,
 * delivered externally, and evaluated.
 *
 * The approval_events row is marked resolved *inside* the UIMessageStream
 * execute block so the update happens after a successful kickoff. A
 * second concurrent call will short-circuit on `status !== "pending"`.
 */
export async function resumeManagedAgentFromApproval(
  input: ResumeManagedAgentFromApprovalInput,
): Promise<ResumeManagedAgentResult> {
  const { data: event, error } = await input.supabase
    .from("approval_events")
    .select("session_id, tool_use_id, thread_id, client_id, run_id, status")
    .eq("approval_id", input.approvalId)
    .eq("client_id", input.clientId)
    .single();

  if (error || !event) {
    return { status: "missing" };
  }

  if (event.status !== "pending") {
    return { status: "already_resolved", threadId: event.thread_id };
  }

  if (!event.session_id || !event.tool_use_id || !event.run_id) {
    return {
      status: "error",
      error: "Approval event is missing session_id, tool_use_id, or run_id.",
    };
  }

  const sessionId = event.session_id;
  const toolUseId = event.tool_use_id;
  const runId = event.run_id;
  const threadId = event.thread_id;
  const approvalId = input.approvalId;
  const clientId = input.clientId;
  const approved = input.approved;
  const denyMessage = input.denyMessage;

  const rawStream = createUIMessageStream({
    execute: async ({ writer }) => {
      try {
        const result = await consumeAnthropicSession({
          anthropic: input.anthropic,
          sessionId,
          runId,
          context: {
            supabase: input.supabase,
            clientId,
            threadId,
            isChatContext: true,
          },
          kickoffApproval: {
            toolUseId,
            result: approved ? "allow" : "deny",
            denyMessage,
          },
          autoDenyApprovals: false,
          callbacks: buildUiStreamCallbacks(writer),
        });

        // Mark the approval event resolved. Conditional on status='pending'
        // so a concurrent resolver loses the race cleanly instead of
        // double-updating. We do this after the kickoff send so a failed
        // send leaves the row pending for retry.
        const { error: updateError } = await input.supabase
          .from("approval_events")
          .update({
            status: approved ? "approved" : "denied",
            resolved_at: new Date().toISOString(),
          })
          .eq("approval_id", approvalId)
          .eq("client_id", clientId)
          .eq("status", "pending");

        if (updateError) {
          console.error(
            "[resumeManagedAgentFromApproval] failed to mark approval resolved",
            updateError,
          );
        }

        await finalizeRun({
          supabase: input.supabase,
          clientId,
          threadId,
          runId,
          result,
          conversationInput: `[approval-resume ${approvalId}: ${approved ? "allow" : "deny"}]`,
          logLabel: "resumeManagedAgentFromApproval",
        });
      } catch (resumeError) {
        try {
          await completeRun(input.supabase, {
            runId,
            status: "failed",
            model: MANAGED_AGENT_MODEL,
            tokensIn: 0,
            tokensOut: 0,
          });
        } catch (cleanupError) {
          console.error(
            "[resumeManagedAgentFromApproval] failed to mark run as failed during cleanup",
            cleanupError,
          );
        }
        throw resumeError;
      }
    },
  });

  return {
    status: "streaming",
    stream: pipeJsonRender(rawStream) as ReadableStream<unknown>,
    threadId,
  };
}
