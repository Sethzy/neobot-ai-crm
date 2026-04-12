/**
 * @module lib/managed-agents/__tests__/session-kickoff.test
 *
 * Tests for `buildKickoffContent` and `getOrCreateSession`. We stub the
 * Anthropic + Supabase clients with the minimal shape the helpers consume
 * so we can assert ordering, agent version pinning, and reuse semantics
 * without standing up a real backend.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { buildKickoffContent, getOrCreateSession } from "../session-kickoff";

describe("buildKickoffContent", () => {
  it("emits separate text blocks for scaffolding and user message", () => {
    const content = buildKickoffContent({
      clientProfile: "profile-text",
      userPreferences: "prefs-text",
      systemReminder: "reminder-text",
      userMessage: "hello",
      customizedSkillSlugs: [],
    });

    expect(content).toEqual([
      { type: "text", text: "profile-text" },
      { type: "text", text: "prefs-text" },
      { type: "text", text: "reminder-text" },
      { type: "text", text: "hello" },
    ]);
  });

  it("omits empty sections cleanly", () => {
    const content = buildKickoffContent({
      clientProfile: null,
      userPreferences: null,
      systemReminder: "reminder",
      userMessage: "hi",
      customizedSkillSlugs: [],
    });

    expect(content).toEqual([
      { type: "text", text: "reminder" },
      { type: "text", text: "hi" },
    ]);
  });

  it("appends an override note when the user has customized skills", () => {
    const content = buildKickoffContent({
      clientProfile: null,
      userPreferences: null,
      systemReminder: "r",
      userMessage: "m",
      customizedSkillSlugs: ["pdf", "qa"],
    });

    expect(content).toContainEqual(
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("customized these skills: pdf, qa"),
      }),
    );
  });
});

const createSession = vi.fn();

function stubAnthropic() {
  return {
    beta: { sessions: { create: createSession } },
  } as never;
}

function stubSupabase(
  row: { session_id: string | null } | null = { session_id: null },
) {
  return {
    from: () => ({
      update: () => ({ eq: async () => ({ data: null, error: null }) }),
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
    }),
  } as never;
}

describe("getOrCreateSession", () => {
  beforeEach(() => {
    createSession.mockReset();
    process.env.ANTHROPIC_AGENT_ID = "agent_123";
    process.env.ANTHROPIC_AGENT_VERSION = "7";
    process.env.ANTHROPIC_ENVIRONMENT_ID = "env_abc";
  });

  it("creates a session pinned to ANTHROPIC_AGENT_VERSION", async () => {
    createSession.mockResolvedValue({ id: "sess_1" });
    const session = await getOrCreateSession({
      anthropic: stubAnthropic(),
      supabase: stubSupabase(),
      threadId: "thread-1",
      threadTitle: "Draft follow-up",
    });
    expect(session.id).toBe("sess_1");
    expect(session.created).toBe(true);
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: { type: "agent", id: "agent_123", version: 7 },
        environment_id: "env_abc",
        title: "Draft follow-up",
      }),
    );
  });

  it("passes resources through to sessions.create on first turn", async () => {
    createSession.mockResolvedValue({ id: "sess_new" });

    await getOrCreateSession({
      anthropic: stubAnthropic(),
      supabase: stubSupabase(),
      threadId: "thread_1",
      threadTitle: null,
      initialResources: [
        {
          type: "file",
          file_id: "file_123",
          mount_path: "/mnt/session/uploads/file_123",
        },
      ],
    });

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        resources: [
          expect.objectContaining({
            type: "file",
            file_id: "file_123",
          }),
        ],
      }),
    );
  });

  it("reuses an existing session_id from conversation_threads", async () => {
    const session = await getOrCreateSession({
      anthropic: stubAnthropic(),
      supabase: stubSupabase({ session_id: "sess_existing" }),
      threadId: "thread-1",
      threadTitle: null,
    });
    expect(session.id).toBe("sess_existing");
    expect(session.created).toBe(false);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("throws when the session_id select query returns an error", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: null,
              error: { message: "RLS denied" },
            }),
          }),
        }),
      }),
    } as never;
    await expect(
      getOrCreateSession({
        anthropic: stubAnthropic(),
        supabase,
        threadId: "thread-1",
        threadTitle: null,
      }),
    ).rejects.toThrow(/RLS denied/);
  });

  it("throws when the session_id update returns an error", async () => {
    createSession.mockResolvedValue({ id: "sess_1" });
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { session_id: null },
              error: null,
            }),
          }),
        }),
        update: () => ({
          eq: async () => ({ data: null, error: { message: "constraint violated" } }),
        }),
      }),
    } as never;
    await expect(
      getOrCreateSession({
        anthropic: stubAnthropic(),
        supabase,
        threadId: "thread-1",
        threadTitle: null,
      }),
    ).rejects.toThrow(/constraint violated/);
  });
});
