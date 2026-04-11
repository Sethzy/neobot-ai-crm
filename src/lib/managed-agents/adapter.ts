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
 *        - retries_exhausted / terminated → persist any partial assistant
 *          output + completeRun(failed) + evaluators
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

import {
  claimApprovalResolution,
  patchApprovalPartState,
  releaseApprovalResolutionClaim,
} from "@/lib/approvals/queries";
import { upsertMessage } from "@/lib/chat/messages";
import { deliverToExternalChannels } from "@/lib/channels/deliver";
import { runEvaluatorsForEvents } from "@/lib/eval/run-evaluators";
import {
  consumeMessageQuota,
  MessageQuotaError,
  messageQuotaErrorCodes,
  releaseMessageQuota,
} from "@/lib/usage/message-quota";
import {
  completeRun,
  createRun,
  markStaleRunsFailed,
} from "@/lib/runner/run-lifecycle";
import { buildSystemReminder } from "@/lib/runner/system-reminder";
import type { Json } from "@/types/database";

import { computeTurnCost } from "./adapter-cost";
import { attachFileToSession } from "./attach-session-file";
import { buildAssistantPartsFromEvents } from "./events-to-assistant-parts";
import { buildKickoffText, getOrCreateSession } from "./session-kickoff";
import { consumeAnthropicSession } from "./session-runner";
import type {
  ManagedFilePart,
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
      // Two chunks: first create the tool part via `tool-input-available`,
      // then transition it into `approval-requested` via the flat
      // `tool-approval-request` chunk. AI SDK v6's client requires a
      // pre-existing tool part keyed by toolCallId before it will apply an
      // approval-request chunk (see `updateToolPart` + `getToolInvocation`
      // in ai/dist/index.mjs). Built-in tools like `bash` never go through
      // `onAgentToolUse`, so the part must be bootstrapped here.
      writer.write({
        type: "tool-input-available",
        toolCallId: e.id,
        toolName: e.name,
        input: e.input,
      } as never);
      writer.write({
        type: "tool-approval-request",
        approvalId,
        toolCallId: e.id,
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

function buildUserMessageParts(input: {
  userMessage: string;
  fileParts: readonly ManagedFilePart[];
}): Json {
  return [
    ...input.fileParts.map((filePart) => ({
      type: "file" as const,
      url: filePart.url,
      mediaType: filePart.mediaType,
      ...(filePart.filename ? { filename: filePart.filename } : {}),
      ...(filePart.storagePath ? { storagePath: filePart.storagePath } : {}),
    })),
    ...(input.userMessage.length > 0
      ? [{ type: "text" as const, text: input.userMessage }]
      : []),
  ] as unknown as Json;
}

async function persistUserInput(options: {
  supabase: ManagedSupabaseClient;
  threadId: string;
  runId: string;
  userMessage: string;
  fileParts: readonly ManagedFilePart[];
  sourceEventId?: string;
}): Promise<void> {
  await upsertMessage(options.supabase, {
    thread_id: options.threadId,
    role: "user",
    content: options.userMessage.length > 0 ? options.userMessage : null,
    parts: buildUserMessageParts({
      userMessage: options.userMessage,
      fileParts: options.fileParts,
    }),
    source_event_id: options.sourceEventId ?? `user:${options.runId}`,
  });
}

async function persistAssistantOutput(options: {
  supabase: ManagedSupabaseClient;
  clientId: string;
  threadId: string;
  runId: string;
  accumulatedEvents: ReadonlyArray<AnthropicEvent>;
  logLabel: string;
}): Promise<void> {
  const { supabase, clientId, threadId, runId, accumulatedEvents, logLabel } = options;
  const parts = buildAssistantPartsFromEvents(accumulatedEvents);
  if (!parts.some((part) => part.type !== "step-start")) {
    return;
  }

  const contentText = getAssistantTextFromParts(parts);
  const sourceEventId = pickSourceEventId(accumulatedEvents, runId);

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
    sourceEventId,
  ).catch((deliveryError) => {
    console.error(
      `[${logLabel}] external channel delivery failed:`,
      deliveryError,
    );
  });
}

async function attachFilesToManagedSession(options: {
  sessionId: string;
  fileParts: readonly ManagedFilePart[];
  logLabel: string;
}): Promise<void> {
  if (options.fileParts.length === 0) {
    return;
  }

  await Promise.all(
    options.fileParts.map(async (filePart) => {
      try {
        const response = await fetch(filePart.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch attachment (${response.status})`);
        }

        await attachFileToSession({
          sessionId: options.sessionId,
          file: await response.blob(),
          filename: filePart.filename ?? "upload",
        });
      } catch (error) {
        console.error(`[${options.logLabel}] Failed to attach file to session:`, error);
      }
    }),
  );
}

/**
 * Persists assistant output for every terminal state, completes successful
 * and failed turns, and runs evaluators for every terminal state except
 * `requires_action`. Shared by the run + resume paths so both entry points
 * behave identically.
 */
async function finalizeRun(options: FinalizeRunOptions): Promise<void> {
  const { supabase, clientId, threadId, runId, result, conversationInput, logLabel } = options;
  const accumulatedEvents = result.accumulatedEvents as ReadonlyArray<AnthropicEvent>;
  if (result.reason === "requires_action") {
    // Paused on approval — persist whatever we streamed (including
    // the approval-requested part so reload renders the prompt) but
    // do NOT mark the run complete. The approval-resume path owns the
    // eventual completion.
    await persistAssistantOutput({
      supabase,
      clientId,
      threadId,
      runId,
      accumulatedEvents,
      logLabel,
    });
    return;
  }

  await persistAssistantOutput({
    supabase,
    clientId,
    threadId,
    runId,
    accumulatedEvents,
    logLabel,
  });

  const costUsd = computeTurnCost({
    inputTokens: result.cost.inputTokens,
    outputTokens: result.cost.outputTokens,
    cacheReadInputTokens: result.cost.cacheReadInputTokens,
    cacheCreationInputTokens: result.cost.cacheCreationInputTokens,
    activeSeconds: result.cost.runtimeSeconds,
  });

  await completeRun(supabase, {
    runId,
    status: result.status === "complete" ? "completed" : "failed",
    model: MANAGED_AGENT_MODEL,
    tokensIn: result.cost.inputTokens,
    tokensOut: result.cost.outputTokens,
    cacheReadTokens: result.cost.cacheReadInputTokens,
    costUsd,
  });

  await runEvaluatorsForEvents(accumulatedEvents, runId, supabase, {
    conversationInput,
  });
}

// ── runManagedAgent (fresh turn) ────────────────────────────────────────────

export interface RunManagedAgentInput {
  anthropic: Anthropic;
  supabase: ManagedSupabaseClient;
  clientId: string;
  threadId: string;
  input: string;
  fileParts?: ManagedFilePart[];
  userMessageSourceId?: string;
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
  let shouldReleaseConsumedQuota = false;
  let consumedQuota: Awaited<ReturnType<typeof consumeMessageQuota>> | null = null;
  let sessionId: string;
  let kickoff: string;

  try {
    const quota = await consumeMessageQuota(input.supabase, input.clientId);
    if (!quota.allowed) {
      throw new MessageQuotaError(
        messageQuotaErrorCodes.limitReached,
        "Monthly message limit reached.",
        { quota },
      );
    }
    consumedQuota = quota;
    shouldReleaseConsumedQuota = true;

    await persistUserInput({
      supabase: input.supabase,
      threadId: input.threadId,
      runId,
      userMessage: input.input,
      fileParts: input.fileParts ?? [],
      sourceEventId: input.userMessageSourceId,
    });
    shouldReleaseConsumedQuota = false;

    const session = await getOrCreateSession({
      anthropic: input.anthropic,
      supabase: input.supabase,
      threadId: input.threadId,
      threadTitle: input.threadTitle,
    });
    sessionId = session.id;

    await attachFilesToManagedSession({
      sessionId,
      fileParts: input.fileParts ?? [],
      logLabel: "runManagedAgent",
    });

    const reminder = await buildSystemReminder(
      input.supabase,
      input.clientId,
      input.threadId,
    );
    kickoff = buildKickoffText({
      clientProfile: input.clientProfile,
      userPreferences: input.userPreferences,
      systemReminder: reminder,
      userMessage: input.input,
    });
  } catch (error) {
    if (shouldReleaseConsumedQuota && consumedQuota) {
      try {
        await releaseMessageQuota(
          input.supabase,
          consumedQuota.clientId,
          consumedQuota.periodStart,
        );
      } catch (releaseError) {
        console.error(
          "[runManagedAgent] failed to release consumed message quota",
          releaseError,
        );
      }
    }
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
        "[runManagedAgent] failed to mark run as failed during setup cleanup",
        cleanupError,
      );
    }
    throw error;
  }

  const rawStream = createUIMessageStream({
    execute: async ({ writer }) => {
      try {
        const result = await consumeAnthropicSession({
          anthropic: input.anthropic,
          sessionId,
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
 * The approval row is claimed before streaming so only one resolver can send
 * `user.tool_confirmation`. If the kickoff never reaches Anthropic, the claim
 * is released back to `pending` for retry.
 */
export async function resumeManagedAgentFromApproval(
  input: ResumeManagedAgentFromApprovalInput,
): Promise<ResumeManagedAgentResult> {
  const claimResult = await claimApprovalResolution(input.supabase, {
    clientId: input.clientId,
    approvalId: input.approvalId,
    approved: input.approved,
  });

  if (!claimResult.success && claimResult.status === "missing") {
    return { status: "missing" };
  }

  if (claimResult.success && claimResult.status === "already_resolved") {
    const approvalDecision = claimResult.event.status === "approved";
    await patchApprovalPartState(input.supabase, {
      clientId: input.clientId,
      threadId: claimResult.event.thread_id,
      approvalId: input.approvalId,
      approved: approvalDecision,
    }).catch((patchError) => {
      console.error(
        "[resumeManagedAgentFromApproval] failed to patch already-resolved approval state",
        patchError,
      );
    });
    return { status: "already_resolved", threadId: claimResult.event.thread_id };
  }

  if (!claimResult.success || claimResult.status !== "claimed") {
    return {
      status: "error",
      error: claimResult.error,
    };
  }

  const claimedStatus = claimResult.claimedStatus as "approved" | "denied";
  const claimedResolvedAt = claimResult.claimedResolvedAt;

  if (
    !claimResult.event.session_id ||
    !claimResult.event.tool_use_id ||
    !claimResult.event.run_id
  ) {
    await releaseApprovalResolutionClaim(input.supabase, {
      clientId: input.clientId,
      approvalId: input.approvalId,
      claimedStatus,
      claimedResolvedAt,
    }).catch((releaseError) => {
      console.error(
        "[resumeManagedAgentFromApproval] failed to release invalid approval claim",
        releaseError,
      );
    });
    return {
      status: "error",
      error: "Approval event is missing session_id, tool_use_id, or run_id.",
    };
  }

  const sessionId = claimResult.event.session_id;
  const toolUseId = claimResult.event.tool_use_id;
  const runId = claimResult.event.run_id;
  const threadId = claimResult.event.thread_id;
  const approvalId = input.approvalId;
  const clientId = input.clientId;
  const approved = input.approved;
  const denyMessage = input.denyMessage;

  const rawStream = createUIMessageStream({
    execute: async ({ writer }) => {
      let didSendKickoffApproval = false;
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
          onKickoffApprovalSent: async () => {
            didSendKickoffApproval = true;
            await patchApprovalPartState(input.supabase, {
              clientId,
              threadId,
              approvalId,
              approved,
            }).catch((patchError) => {
              console.error(
                "[resumeManagedAgentFromApproval] failed to patch approval state",
                patchError,
              );
            });
          },
          autoDenyApprovals: false,
          callbacks: buildUiStreamCallbacks(writer),
        });

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
        if (!didSendKickoffApproval) {
          await releaseApprovalResolutionClaim(input.supabase, {
            clientId,
            approvalId,
            claimedStatus,
            claimedResolvedAt,
          }).catch((releaseError) => {
            console.error(
              "[resumeManagedAgentFromApproval] failed to release approval claim",
              releaseError,
            );
          });
        }
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
