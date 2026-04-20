/**
 * Session kickoff helpers for the Managed Agents chat adapter.
 *
 * - `buildKickoffContent` emits the profile/preferences/reminder/user
 *   input as distinct `user.message.content` text blocks so downstream
 *   consumers can distinguish scaffolding from the user's own words.
 * - `getOrCreateSession` either reuses the cached `session_id` from
 *   `conversation_threads` or creates a new Anthropic session pinned to
 *   the agent version resolved from the user's selected model via
 *   `resolveAgentRef`, then caches its id back.
 *
 * Model selection applies to **new threads only**. Existing threads
 * reuse their cached session, which is already pinned to a specific
 * agent version. Mid-thread model switching would require orphaning
 * the existing session — that's deferred to a future change.
 *
 * @module lib/managed-agents/session-kickoff
 */
import type Anthropic from "@anthropic-ai/sdk";

import {
  CHAT_ANTHROPIC_REQUEST_OPTIONS,
  CHAT_ANTHROPIC_SESSION_CREATE_REQUEST_OPTIONS,
} from "./chat-request-options";
import { resolveAgentRef } from "./agent-config";
import type { KickoffTextBlock, ManagedSupabaseClient } from "./types";
import type { SessionAttachmentMount } from "./upload-files-for-session";

export interface KickoffSkillSummary {
  slug: string;
  description: string;
}

export interface KickoffInput {
  clientProfile: string | null;
  userPreferences: string | null;
  systemReminder: string;
  userMessage: string;
  installedSkills: KickoffSkillSummary[];
  notInstalledSkills: KickoffSkillSummary[];
  attachmentHints?: SessionAttachmentMount[];
}

function formatKickoffSkillList(skills: KickoffSkillSummary[]): string {
  if (skills.length === 0) {
    return "none";
  }

  return skills
    .map((skill) => `${skill.slug} — ${skill.description}`)
    .join("; ");
}

export function buildKickoffContent(input: KickoffInput): KickoffTextBlock[] {
  const blocks: KickoffTextBlock[] = [];

  if (input.clientProfile?.trim().length) {
    blocks.push({ type: "text", text: input.clientProfile.trim() });
  }
  if (input.userPreferences?.trim().length) {
    blocks.push({ type: "text", text: input.userPreferences.trim() });
  }
  if (input.systemReminder.trim().length) {
    blocks.push({ type: "text", text: input.systemReminder.trim() });
  }
  blocks.push({
    type: "text",
    text: "For lightweight turns such as greetings, simple arithmetic, or direct time/date questions: answer immediately in one short sentence, do not personalize with client context, and do not inspect skills or use tools unless the prompt explicitly requires them.",
  });
  blocks.push({
    type: "text",
    text: `Installed skills for this session: ${formatKickoffSkillList(input.installedSkills)}. You may use only installed skills.`,
  });
  blocks.push({
    type: "text",
    text: input.notInstalledSkills.length > 0
      ? `Not installed skills for this session: ${formatKickoffSkillList(input.notInstalledSkills)}. Do not use any skill from this not-installed list, even if the request matches its description.`
      : "Not installed skills for this session: none.",
  });
  if ((input.attachmentHints?.length ?? 0) > 0) {
    const attachmentLines = input.attachmentHints!.map((attachmentHint) =>
      `- ${attachmentHint.filename}: session path ${attachmentHint.mountPath}${attachmentHint.storagePath ? `; durable path /agent/${attachmentHint.storagePath}` : ""}`,
    );
    blocks.push({
      type: "text",
      text: [
        "Current message attachments are mounted inside the managed-agent session container.",
        "Use Anthropic built-in read/bash tools on the session paths below when you need to inspect or process those files.",
        "Do not call storage_read on /mnt/session/... or /workspace/... paths. storage_read is only for durable /agent/* files.",
        ...attachmentLines,
      ].join("\n"),
    });
  }

  blocks.push({ type: "text", text: input.userMessage });

  return blocks;
}

export interface GetOrCreateSessionInput {
  anthropic: Anthropic;
  supabase: ManagedSupabaseClient;
  threadId: string;
  threadTitle: string | null;
  /** User-facing model ID (e.g. `"anthropic/claude-sonnet-4-6"`). Used to
   *  resolve the correct Anthropic agent when creating a **new** session.
   *  Ignored for existing sessions (they're already pinned to an agent). */
  selectedChatModel?: string;
  initialResources?: Array<{
    type: "file";
    file_id: string;
    mount_path: string;
  }>;
}

export interface ManagedSession {
  id: string;
  created: boolean;
}

export async function getExistingSessionId(input: {
  supabase: ManagedSupabaseClient;
  threadId: string;
}): Promise<string | null> {
  const { data: row, error: selectError } = await input.supabase
    .from("conversation_threads")
    .select("session_id")
    .eq("thread_id", input.threadId)
    .maybeSingle();

  if (selectError) {
    throw new Error(
      `Failed to read conversation_threads.session_id for thread_id=${input.threadId}: ${selectError.message}`,
    );
  }

  return row?.session_id ?? null;
}

export async function createSessionForThread(
  input: GetOrCreateSessionInput,
): Promise<string> {
  const ref = resolveAgentRef(
    input.selectedChatModel ?? "anthropic/claude-sonnet-4-6",
  );
  const environmentId = process.env.ANTHROPIC_ENVIRONMENT_ID;
  if (!environmentId) {
    throw new Error(
      "Managed agents env var missing: ANTHROPIC_ENVIRONMENT_ID",
    );
  }

  const tCreate = performance.now();
  const session = await input.anthropic.beta.sessions.create({
    agent: {
      type: "agent",
      id: ref.agentId,
      version: ref.agentVersion,
    },
    environment_id: environmentId,
    title: input.threadTitle ?? undefined,
    ...(input.initialResources && input.initialResources.length > 0
      ? { resources: input.initialResources }
      : {}),
  } as never, CHAT_ANTHROPIC_SESSION_CREATE_REQUEST_OPTIONS);
  console.log(`[session-kickoff] sessions.create API: ${Math.round(performance.now() - tCreate)}ms sessionId=${session.id}`);

  const { error: updateError } = await input.supabase
    .from("conversation_threads")
    .update({ session_id: session.id })
    .eq("thread_id", input.threadId);

  if (updateError) {
    throw new Error(
      `Failed to cache session_id=${session.id} on conversation_threads thread_id=${input.threadId}: ${updateError.message}`,
    );
  }

  return session.id;
}

/**
 * Check whether a cached session is still usable. Sessions that have been
 * terminated or archived cannot accept new events — the thread needs a
 * fresh session. Returns `true` if the session is alive (`idle` or
 * `running`), `false` if it's dead or unreachable.
 */
async function isSessionAlive(
  anthropic: Anthropic,
  sessionId: string,
): Promise<boolean> {
  try {
    const t0 = performance.now();
    const session = await anthropic.beta.sessions.retrieve(
      sessionId,
      {},
      CHAT_ANTHROPIC_REQUEST_OPTIONS,
    );
    console.log(`[session-kickoff] isSessionAlive check: ${Math.round(performance.now() - t0)}ms status=${session.status}`);
    return session.status === "idle" || session.status === "running" || session.status === "rescheduling";
  } catch {
    // 404 or network error — treat as dead.
    return false;
  }
}

/**
 * Clear the cached session_id from the thread so the next call creates
 * a fresh session.
 */
async function clearCachedSessionId(
  supabase: ManagedSupabaseClient,
  threadId: string,
): Promise<void> {
  await supabase
    .from("conversation_threads")
    .update({ session_id: null })
    .eq("thread_id", threadId);
}

export async function getOrCreateSession(
  input: GetOrCreateSessionInput,
): Promise<ManagedSession> {
  const existingSessionId = await getExistingSessionId({
    supabase: input.supabase,
    threadId: input.threadId,
  });

  if (existingSessionId) {
    const alive = await isSessionAlive(input.anthropic, existingSessionId);
    if (alive) {
      return { id: existingSessionId, created: false };
    }

    // Session is dead — clear the stale cache and fall through to create.
    console.warn(
      `[session-kickoff] cached session ${existingSessionId} for thread ${input.threadId} is no longer alive — creating fresh session`,
    );
    await clearCachedSessionId(input.supabase, input.threadId);
  }

  const sessionId = await createSessionForThread(input);

  return { id: sessionId, created: true };
}
