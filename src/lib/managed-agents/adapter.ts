/**
 * Chat adapter — thin wrapper over `consumeAnthropicSession`.
 *
 * Responsibilities (everything else lives in the session runner):
 *   1. Create an observability run record via `createRunRecord`.
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
 * re-entry point used by `/api/tool-confirm` and the Telegram callback
 * handler. It mirrors `runManagedAgent`'s finalization shape but sends a
 * `user.tool_confirmation` as its kickoff and reuses the run_id recorded
 * on the approval event instead of creating a new run.
 *
 * @module lib/managed-agents/adapter
 */
import type Anthropic from "@anthropic-ai/sdk";
import { createUIMessageStream } from "ai";
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
  createRunRecord,
} from "@/lib/runner/run-lifecycle";
import { listCustomizedSkillSlugs } from "@/lib/runner/skills/list-customized-skill-slugs";
import { buildSystemReminder } from "@/lib/runner/system-reminder";
import type { Json } from "@/types/database";

import { computeTurnCost } from "./adapter-cost";
import { buildAssistantPartsFromEvents } from "./events-to-assistant-parts";
import {
  buildKickoffContent,
  createSessionForThread,
  getExistingSessionId,
} from "./session-kickoff";
import { consumeAnthropicSession } from "./session-runner";
import { buildUiStreamCallbacks } from "./session-stream-forwarder";
import { pickSourceEventId } from "./source-event-id";
import {
  buildSessionAttachmentMounts,
  mountUploadedFilesToSession,
  uploadFilePartsToAnthropic,
} from "./upload-files-for-session";
import { downloadSessionFiles, type DownloadedSessionFile } from "./download-session-files";
import type {
  ManagedFilePart,
  ManagedSupabaseClient,
  SessionRunnerOptions,
  SessionRunnerResult,
} from "./types";

import type { AnthropicEvent } from "./event-types";
import { getAssistantTextFromParts } from "@/lib/runner/message-utils";

import { resolveAgentRef } from "./agent-config";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";

export interface FinalizeRunOptions {
  supabase: ManagedSupabaseClient;
  clientId: string;
  threadId: string;
  runId: string;
  sessionId: string;
  result: SessionRunnerResult;
  /** Conversation input passed to evaluators. */
  conversationInput: string;
  /** Context label for log lines — "runManagedAgent" | "resumeManagedAgent". */
  logLabel: string;
  /** Anthropic model ID for telemetry (e.g. `"claude-sonnet-4-6"`). */
  anthropicModelId: string;
}

function getUrlPath(value: string): string {
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
}

function summarizeManagedFileParts(fileParts: readonly ManagedFilePart[]) {
  return fileParts.map((filePart) => ({
    filename: filePart.filename ?? null,
    mediaType: filePart.mediaType,
    storagePath: filePart.storagePath ?? null,
    urlPath: getUrlPath(filePart.url),
  }));
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

async function persistGeneratedThreadTitle(options: {
  supabase: ManagedSupabaseClient;
  clientId: string;
  threadId: string;
  title: string;
}): Promise<void> {
  const { error } = await options.supabase
    .from("conversation_threads")
    .update({ title: options.title })
    .eq("thread_id", options.threadId)
    .eq("client_id", options.clientId);

  if (error) {
    throw new Error(error.message);
  }
}

async function persistAssistantOutput(options: {
  supabase: ManagedSupabaseClient;
  clientId: string;
  threadId: string;
  runId: string;
  accumulatedEvents: ReadonlyArray<AnthropicEvent>;
  generatedFiles?: ReadonlyArray<DownloadedSessionFile>;
  logLabel: string;
}): Promise<void> {
  const { supabase, clientId, threadId, runId, accumulatedEvents, generatedFiles = [], logLabel } = options;
  const parts = [
    ...buildAssistantPartsFromEvents(accumulatedEvents),
    ...generatedFiles.map((file) => ({
      type: "file" as const,
      url: file.signedUrl,
      mediaType: file.mediaType,
      filename: file.filename,
      storagePath: file.storagePath,
    })),
  ];
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

export async function attachFilesToManagedSession(options: {
  anthropic: Anthropic;
  sessionId: string;
  fileParts: readonly ManagedFilePart[];
  logLabel: string;
}): Promise<void> {
  if (options.fileParts.length === 0) {
    return;
  }

  console.info("[runManagedAgent] attaching files to existing session", {
    sessionId: options.sessionId,
    fileParts: summarizeManagedFileParts(options.fileParts),
  });

  const attachmentMounts = buildSessionAttachmentMounts(options.fileParts);
  const uploadedFiles = await uploadFilePartsToAnthropic(
    options.anthropic,
    options.fileParts,
  );

  await mountUploadedFilesToSession({
    anthropic: options.anthropic,
    sessionId: options.sessionId,
    uploadedFiles,
    mountPaths: attachmentMounts.map((attachmentMount) => attachmentMount.mountPath),
    logLabel: options.logLabel,
  });
}

/**
 * Persists assistant output for every terminal state, completes successful
 * and failed turns, and runs evaluators for every terminal state except
 * `requires_action`. Shared by the run + resume paths so both entry points
 * behave identically.
 */
export async function finalizeRun(options: FinalizeRunOptions): Promise<void> {
  const { supabase, clientId, threadId, runId, sessionId, result, conversationInput, logLabel, anthropicModelId } = options;
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

  const generatedFiles = await downloadSessionFiles({
    supabase,
    clientId,
    sessionId,
  });

  // Persist message (+ external delivery), run evaluators, and settle
  // the cost retrieve in parallel. completeRun depends on cost, so it
  // chains off the retrieve inside the Promise.all.
  await Promise.all([
    persistAssistantOutput({
      supabase,
      clientId,
      threadId,
      runId,
      accumulatedEvents,
      generatedFiles,
      logLabel,
    }),
    result.costRetrievePromise.then(() => {
      const costUsd = computeTurnCost({
        inputTokens: result.cost.inputTokens,
        outputTokens: result.cost.outputTokens,
        cacheReadInputTokens: result.cost.cacheReadInputTokens,
        cacheCreationInputTokens: result.cost.cacheCreationInputTokens,
        activeSeconds: result.cost.runtimeSeconds,
        anthropicModelId: anthropicModelId,
      });
      return completeRun(supabase, {
        runId,
        status: result.status === "complete" ? "completed" : "failed",
        model: anthropicModelId,
        tokensIn: result.cost.inputTokens,
        tokensOut: result.cost.outputTokens,
        cacheReadTokens: result.cost.cacheReadInputTokens,
        costUsd,
      });
    }),
    runEvaluatorsForEvents(accumulatedEvents, runId, supabase, {
      conversationInput,
    }),
  ]);
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
  generatedTitlePromise?: Promise<string> | null;
  /** User-selected model ID from the chat picker. Determines which
   *  Anthropic agent is used for new sessions. Falls back to
   *  `DEFAULT_CHAT_MODEL` when absent. */
  selectedChatModel?: string;
}

export async function runManagedAgent(
  input: RunManagedAgentInput,
): Promise<ReadableStream<unknown>> {
  const tAdapterStart = performance.now();
  const effectiveModelId = input.selectedChatModel ?? DEFAULT_CHAT_MODEL;
  const agentRef = resolveAgentRef(effectiveModelId);

  let shouldReleaseConsumedQuota = false;
  let consumedQuota: Awaited<ReturnType<typeof consumeMessageQuota>> | null = null;
  let sessionId: string;
  let kickoffContent: NonNullable<SessionRunnerOptions["kickoffContent"]>;

  // Run record creation + quota check in parallel — neither depends on the other.
  const [runId, quota] = await Promise.all([
    createRunRecord(input.supabase, {
      threadId: input.threadId,
      clientId: input.clientId,
      runType: "chat",
      model: agentRef.anthropicModelId,
    }),
    consumeMessageQuota(input.supabase, input.clientId),
  ]);
  const tRunRecordAndQuota = performance.now();

  try {
    if (!quota.allowed) {
      throw new MessageQuotaError(
        messageQuotaErrorCodes.limitReached,
        "Monthly message limit reached.",
        { quota },
      );
    }
    consumedQuota = quota;
    shouldReleaseConsumedQuota = true;

    const managedFileParts = input.fileParts ?? [];
    const attachmentMounts = buildSessionAttachmentMounts(managedFileParts);

    if (managedFileParts.length > 0) {
      console.info("[runManagedAgent] received file parts", {
        threadId: input.threadId,
        fileParts: summarizeManagedFileParts(managedFileParts),
      });
    }

    const [
      { durationMs: persistUserInputMs },
      { result: existingSessionId, durationMs: existingSessionLookupMs },
      { result: reminder, durationMs: systemReminderMs },
      { result: customizedSkillSlugs, durationMs: customizedSkillsMs },
    ] = await Promise.all([
      (async () => {
        const tStart = performance.now();
        await persistUserInput({
          supabase: input.supabase,
          threadId: input.threadId,
          runId,
          userMessage: input.input,
          fileParts: managedFileParts,
          sourceEventId: input.userMessageSourceId,
        });
        return {
          durationMs: Math.round(performance.now() - tStart),
        };
      })(),
      (async () => {
        const tStart = performance.now();
        const result = await getExistingSessionId({
          supabase: input.supabase,
          threadId: input.threadId,
        });
        return {
          result,
          durationMs: Math.round(performance.now() - tStart),
        };
      })(),
      (async () => {
        const tStart = performance.now();
        const result = await buildSystemReminder(input.supabase, input.clientId);
        return {
          result,
          durationMs: Math.round(performance.now() - tStart),
        };
      })(),
      (async () => {
        const tStart = performance.now();
        const result = await listCustomizedSkillSlugs(
          input.supabase,
          input.clientId,
        );
        return {
          result,
          durationMs: Math.round(performance.now() - tStart),
        };
      })(),
    ]);
    const tParallelSetup = performance.now();

    console.info("[runManagedAgent] session lookup", {
      threadId: input.threadId,
      existingSessionId,
      filePartCount: managedFileParts.length,
    });

    let initialResources:
      | Array<{ type: "file"; file_id: string; mount_path: string }>
      | undefined;

    if (!existingSessionId && managedFileParts.length > 0) {
      const uploadedFiles = await uploadFilePartsToAnthropic(
        input.anthropic,
        managedFileParts,
      );
      initialResources = uploadedFiles.map((uploadedFile, index) => ({
        type: "file" as const,
        file_id: uploadedFile.fileId,
        mount_path:
          attachmentMounts[index]?.mountPath
          ?? `/mnt/session/uploads/${uploadedFile.filename}`,
      }));

      console.info("[runManagedAgent] prepared initial Anthropic resources", {
        threadId: input.threadId,
        resources: initialResources.map((resource) => ({
          anthropicFileId: resource.file_id,
          mountPath: resource.mount_path,
        })),
      });
    }
    const tFileUpload = performance.now();

    const session = existingSessionId
      ? { id: existingSessionId, created: false as const }
      : {
          id: await createSessionForThread({
            anthropic: input.anthropic,
            supabase: input.supabase,
            threadId: input.threadId,
            threadTitle: input.threadTitle,
            selectedChatModel: effectiveModelId,
            initialResources,
          }),
          created: true as const,
        };

    sessionId = session.id;

    // Backfill session_id on the run record so the webhook safety net can
    // look up orphaned runs by Anthropic session_id.
    await input.supabase
      .from("runs")
      .update({ session_id: sessionId })
      .eq("run_id", runId);

    const tSessionReady = performance.now();

    console.info("[runManagedAgent] session ready", {
      threadId: input.threadId,
      sessionId,
      created: session.created,
      filePartCount: managedFileParts.length,
    });

    if (!session.created) {
      await attachFilesToManagedSession({
        anthropic: input.anthropic,
        sessionId,
        fileParts: managedFileParts,
        logLabel: "runManagedAgent",
      });
    }
    const tAttachFiles = performance.now();

    kickoffContent = buildKickoffContent({
      clientProfile: session.created ? input.clientProfile : null,
      userPreferences: session.created ? input.userPreferences : null,
      systemReminder: reminder,
      userMessage: input.input,
      customizedSkillSlugs,
      attachmentHints: attachmentMounts,
    });
    const tKickoffBuild = performance.now();

    console.info("[runManagedAgent] adapter setup timing (ms)", {
      runRecordAndQuota: Math.round(tRunRecordAndQuota - tAdapterStart),
      parallelSetup: Math.round(tParallelSetup - tRunRecordAndQuota),
      persistUserInput: persistUserInputMs,
      existingSessionLookup: existingSessionLookupMs,
      systemReminder: systemReminderMs,
      customizedSkills: customizedSkillsMs,
      fileUpload: Math.round(tFileUpload - tParallelSetup),
      sessionCreate: Math.round(tSessionReady - tFileUpload),
      attachFiles: Math.round(tAttachFiles - tSessionReady),
      kickoffBuild: Math.round(tKickoffBuild - tAttachFiles),
      total: Math.round(tKickoffBuild - tAdapterStart),
    });

    shouldReleaseConsumedQuota = false;
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
        model: agentRef.anthropicModelId,
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
      const generatedTitleTask = input.generatedTitlePromise
        ? (async () => {
            try {
              const generatedTitle = (await input.generatedTitlePromise).trim();

              if (generatedTitle.length === 0) {
                return;
              }

              await persistGeneratedThreadTitle({
                supabase: input.supabase,
                clientId: input.clientId,
                threadId: input.threadId,
                title: generatedTitle,
              });
              writer.write({
                type: "data-chat-title",
                data: generatedTitle,
              } as never);
            } catch (titleError) {
              console.error(
                "[runManagedAgent] failed to generate or persist thread title",
                titleError,
              );
            }
          })()
        : null;

      try {
        const tConsumeStart = performance.now();
        console.info("[runManagedAgent] entering consumeAnthropicSession", {
          sessionId: sessionId.slice(-8),
          timeSinceAdapterStart: Math.round(tConsumeStart - tAdapterStart),
        });
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
          kickoffContent,
          autoDenyApprovals: false,
          callbacks: buildUiStreamCallbacks(writer),
        });
        const tConsumeEnd = performance.now();

        const tFinalizeStart = performance.now();
        await finalizeRun({
          supabase: input.supabase,
          clientId: input.clientId,
          threadId: input.threadId,
          runId,
          sessionId,
          result,
          conversationInput: input.input,
          logLabel: "runManagedAgent",
          anthropicModelId: agentRef.anthropicModelId,
        });
        const tFinalizeEnd = performance.now();

        if (generatedTitleTask) {
          await generatedTitleTask;
        }

        console.info("[runManagedAgent] stream phase timing (ms)", {
          consume: Math.round(tConsumeEnd - tConsumeStart),
          finalize: Math.round(tFinalizeEnd - tFinalizeStart),
          total: Math.round(tFinalizeEnd - tConsumeStart),
        });
      } catch (error) {
        // Anything thrown after createRunRecord() but before the run is
        // marked complete leaves the row stuck in `running` until the
        // pg_cron `sweep_stale_runs` job picks it up. Mark failed
        // eagerly so the thread isn't locked, then re-throw so the
        // UIMessageStream surfaces the error to the consumer.
        try {
          await completeRun(input.supabase, {
            runId,
            status: "failed",
            model: agentRef.anthropicModelId,
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

  // Read the model from the run record (set at creation by runManagedAgent).
  // Falls back to Sonnet for runs created before this field was populated.
  const { data: runRow } = await input.supabase
    .from("runs")
    .select("model")
    .eq("run_id", runId)
    .maybeSingle();
  const resumeModelId = runRow?.model ?? "claude-sonnet-4-6";

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
          sessionId,
          result,
          conversationInput: `[approval-resume ${approvalId}: ${approved ? "allow" : "deny"}]`,
          logLabel: "resumeManagedAgentFromApproval",
          anthropicModelId: resumeModelId,
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
            model: resumeModelId,
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
