/**
 * Tests for POST /api/chat/send — fire-and-forget user message endpoint.
 *
 * @module app/api/chat/send/__tests__/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authenticateRequest,
  resolveClientId,
  getAnthropicClient,
  upsertMessage,
  getOrCreateSession,
  buildKickoffContent,
  uploadFilePartsToAnthropic,
  buildSystemReminder,
  listCustomizedSkillSlugs,
  persistTurnInBackground,
  afterFn,
  checkRateLimit,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  resolveClientId: vi.fn(),
  getAnthropicClient: vi.fn(),
  upsertMessage: vi.fn(),
  getOrCreateSession: vi.fn(),
  buildKickoffContent: vi.fn(),
  uploadFilePartsToAnthropic: vi.fn(),
  buildSystemReminder: vi.fn(),
  listCustomizedSkillSlugs: vi.fn(),
  persistTurnInBackground: vi.fn(),
  afterFn: vi.fn(),
  checkRateLimit: vi.fn(),
}));

const maybeSingle = vi.fn();
const single = vi.fn();
const insertFn = vi.fn();
const sendFn = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest,
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
}));
vi.mock("@/lib/chat/client-id", () => ({ resolveClientId }));
vi.mock("@/lib/managed-agents/anthropic-client", () => ({
  getAnthropicClient,
}));
vi.mock("@/lib/chat/messages", () => ({ upsertMessage }));
vi.mock("@/lib/managed-agents/session-kickoff", () => ({
  getOrCreateSession,
  buildKickoffContent,
}));
vi.mock("@/lib/managed-agents/upload-files-for-session", () => ({
  uploadFilePartsToAnthropic,
}));
vi.mock("@/lib/runner/system-reminder", () => ({ buildSystemReminder }));
vi.mock("@/lib/runner/skills/list-customized-skill-slugs", () => ({
  listCustomizedSkillSlugs,
}));
vi.mock("@/lib/managed-agents/persist-turn-in-background", () => ({
  persistTurnInBackground,
}));
vi.mock("next/server", () => ({ after: afterFn }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));

import { POST } from "../route";

describe("POST /api/chat/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingle.mockReset();
    single.mockReset();
    insertFn.mockReset();

    authenticateRequest.mockResolvedValue({
      kind: "ok",
      userId: "u1",
      supabase: {
        from: (table: string) => {
          if (table === "conversation_threads") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({ maybeSingle }),
                    maybeSingle,
                  }),
                }),
              }),
              insert: insertFn.mockReturnValue({ error: null }),
            };
          }
          if (table === "clients") {
            return {
              select: () => ({ eq: () => ({ single }) }),
            };
          }
          return {};
        },
      },
    });
    resolveClientId.mockResolvedValue("c1");
    checkRateLimit.mockResolvedValue({ allowed: true });
    getAnthropicClient.mockReturnValue({
      beta: { sessions: { events: { send: sendFn } } },
    });
    upsertMessage.mockResolvedValue(undefined);
    getOrCreateSession.mockResolvedValue({ id: "sess_1", created: false });
    buildKickoffContent.mockReturnValue([{ type: "text", text: "hello" }]);
    uploadFilePartsToAnthropic.mockResolvedValue([]);
    buildSystemReminder.mockResolvedValue("reminder");
    listCustomizedSkillSlugs.mockResolvedValue([]);
    persistTurnInBackground.mockResolvedValue(undefined);
    afterFn.mockImplementation((fn: () => unknown) => fn());

    // Thread exists
    maybeSingle.mockResolvedValue({
      data: { thread_id: "t1", title: "Test Thread" },
      error: null,
    });
    // Client context
    single.mockResolvedValue({
      data: { client_profile: "profile", user_preferences: "prefs" },
      error: null,
    });
  });

  it("returns 400 when body is invalid", async () => {
    const res = await POST(
      new Request("http://localhost/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    authenticateRequest.mockResolvedValue({
      kind: "error",
      response: new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
      }),
    });
    const res = await POST(
      new Request("http://localhost/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: "t1",
          message: {
            role: "user",
            parts: [{ type: "text", text: "hello" }],
          },
        }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("persists user message and sends to session", async () => {
    const res = await POST(
      new Request("http://localhost/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: "t1",
          message: {
            role: "user",
            parts: [{ type: "text", text: "hello" }],
          },
        }),
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });

    // User message persisted
    expect(upsertMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        thread_id: "t1",
        role: "user",
      }),
    );

    // Kickoff sent to Anthropic
    expect(sendFn).toHaveBeenCalledWith("sess_1", {
      events: [{ type: "user.message", content: expect.any(Array) }],
    });

    // Background persistence kicked off via after()
    expect(afterFn).toHaveBeenCalled();
    expect(persistTurnInBackground).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "sess_1",
        threadId: "t1",
        clientId: "c1",
      }),
    );
  });

  it("returns 400 when message has no text and no files", async () => {
    const res = await POST(
      new Request("http://localhost/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: "t1",
          message: {
            role: "user",
            parts: [{ type: "text", text: "  " }],
          },
        }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 30 });
    const res = await POST(
      new Request("http://localhost/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: "t1",
          message: {
            role: "user",
            parts: [{ type: "text", text: "hello" }],
          },
        }),
      }),
    );
    expect(res.status).toBe(429);
  });
});
