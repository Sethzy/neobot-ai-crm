/**
 * Session kickoff helpers for the Managed Agents chat adapter.
 *
 * - `buildKickoffContent` emits the profile/preferences/reminder/user
 *   input as distinct `user.message.content` text blocks so downstream
 *   consumers can distinguish scaffolding from the user's own words.
 * - `getOrCreateSession` either reuses the cached `session_id` from
 *   `conversation_threads` or creates a new Anthropic session pinned to
 *   the `ANTHROPIC_AGENT_VERSION` env var, then caches its id back.
 *
 * @module lib/managed-agents/session-kickoff
 */
import type Anthropic from "@anthropic-ai/sdk";

import type { KickoffTextBlock, ManagedSupabaseClient } from "./types";

export interface KickoffInput {
  clientProfile: string | null;
  userPreferences: string | null;
  systemReminder: string;
  userMessage: string;
  customizedSkillSlugs: string[];
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
  if (input.customizedSkillSlugs.length > 0) {
    blocks.push({
      type: "text",
      text: `The user has customized these skills: ${input.customizedSkillSlugs.join(", ")}. When you are about to run one of these, first call storage_read('/agent/skills/<slug>/SKILL.md') and use that content as your workflow instead of the predefined one.`,
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
  const agentId = process.env.ANTHROPIC_AGENT_ID;
  const agentVersion = Number(process.env.ANTHROPIC_AGENT_VERSION);
  const environmentId = process.env.ANTHROPIC_ENVIRONMENT_ID;
  if (!agentId || !Number.isFinite(agentVersion) || !environmentId) {
    throw new Error(
      "Managed agents env vars missing: ANTHROPIC_AGENT_ID / ANTHROPIC_AGENT_VERSION / ANTHROPIC_ENVIRONMENT_ID",
    );
  }

  const session = await input.anthropic.beta.sessions.create({
    agent: { type: "agent", id: agentId, version: agentVersion },
    environment_id: environmentId,
    title: input.threadTitle ?? undefined,
    ...(input.initialResources && input.initialResources.length > 0
      ? { resources: input.initialResources }
      : {}),
  } as never);

  const { error: updateError } = await input.supabase
    .from("conversation_threads")
    .update({ session_id: session.id })
    .eq("thread_id", input.threadId);

  if (updateError) {
    // The Anthropic session was created but we couldn't cache its id.
    // The thread will keep creating new sessions on every turn — fail
    // loud so this is fixed at the source rather than silently leaking
    // sessions.
    throw new Error(
      `Failed to cache session_id=${session.id} on conversation_threads thread_id=${input.threadId}: ${updateError.message}`,
    );
  }

  return session.id;
}

export async function getOrCreateSession(
  input: GetOrCreateSessionInput,
): Promise<ManagedSession> {
  const existingSessionId = await getExistingSessionId({
    supabase: input.supabase,
    threadId: input.threadId,
  });

  if (existingSessionId) {
    return { id: existingSessionId, created: false };
  }

  const sessionId = await createSessionForThread(input);

  return { id: sessionId, created: true };
}
