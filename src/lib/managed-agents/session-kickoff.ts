/**
 * Session kickoff helpers for the Managed Agents chat adapter.
 *
 * - `buildKickoffText` is a pure concatenation of profile/preferences/
 *   reminder/user-message into the single text body the runner sends as
 *   `user.message` to seed the session.
 * - `getOrCreateSession` either reuses the cached `session_id` from
 *   `conversation_threads` or creates a new Anthropic session pinned to
 *   the `ANTHROPIC_AGENT_VERSION` env var, then caches its id back.
 *
 * @module lib/managed-agents/session-kickoff
 */
import type Anthropic from "@anthropic-ai/sdk";

import type { ManagedSupabaseClient } from "./types";

export interface KickoffInput {
  clientProfile: string | null;
  userPreferences: string | null;
  systemReminder: string;
  userMessage: string;
}

export function buildKickoffText(input: KickoffInput): string {
  const sections: string[] = [];
  if (input.clientProfile?.trim().length) {
    sections.push(input.clientProfile.trim());
  }
  if (input.userPreferences?.trim().length) {
    sections.push(input.userPreferences.trim());
  }
  sections.push(input.systemReminder.trim());
  sections.push(input.userMessage);
  return sections.join("\n\n");
}

export interface GetOrCreateSessionInput {
  anthropic: Anthropic;
  supabase: ManagedSupabaseClient;
  threadId: string;
  threadTitle: string | null;
}

export interface ManagedSession {
  id: string;
  created: boolean;
}

export async function getOrCreateSession(
  input: GetOrCreateSessionInput,
): Promise<ManagedSession> {
  const { data: row } = await input.supabase
    .from("conversation_threads")
    .select("session_id")
    .eq("thread_id", input.threadId)
    .maybeSingle();

  if (row?.session_id) {
    return { id: row.session_id, created: false };
  }

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
  } as never);

  await input.supabase
    .from("conversation_threads")
    .update({ session_id: session.id })
    .eq("thread_id", input.threadId);

  return { id: session.id, created: true };
}
