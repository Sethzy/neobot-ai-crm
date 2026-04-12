/**
 * @module lib/managed-agents/__tests__/adapter.test
 *
 * Tests for `runManagedAgent` — the thin chat wrapper over the session
 * runner. The runner itself is mocked: we verify that the adapter wires
 * the runner's callbacks into the UIMessageStream writer and finalizes
 * the run correctly across the three terminal variants:
 *   - end_turn → completeRun(completed) + createMessages + evaluators
 *   - retries_exhausted → completeRun(failed)
 *   - requires_action → createMessages, but NOT completeRun (the
 *     approval-resolution path in H4 owns the final completion)
 *
 * We also assert spec-fence handling via pipeJsonRender.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../session-runner", () => ({
  consumeAnthropicSession: vi.fn(),
}));
vi.mock("../session-kickoff", () => ({
  buildKickoffText: vi.fn(() => "kickoff"),
  getOrCreateSession: vi
    .fn()
    .mockResolvedValue({ id: "sess_1", created: true }),
}));
vi.mock("@/lib/runner/system-reminder", () => ({
  buildSystemReminder: vi.fn().mockResolvedValue("<reminder>ok</reminder>"),
}));
vi.mock("@/lib/runner/skills/list-customized-skill-slugs", () => ({
  listCustomizedSkillSlugs: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/runner/run-lifecycle", () => ({
  createRun: vi.fn().mockResolvedValue({ created: true, runId: "run_1" }),
  completeRun: vi.fn().mockResolvedValue(undefined),
  markStaleRunsFailed: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/chat/messages", () => ({
  upsertMessage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/channels/deliver", () => ({
  deliverToExternalChannels: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/eval/run-evaluators", () => ({
  runEvaluatorsForEvents: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/usage/message-quota", () => ({
  consumeMessageQuota: vi.fn().mockResolvedValue({
    allowed: true,
    clientId: "c1",
    planName: "Free",
    monthlyMessageLimit: 100,
    messagesUsed: 1,
    messagesRemaining: 99,
    periodStart: "2026-04-01",
    nextResetDate: "2026-05-01",
  }),
  releaseMessageQuota: vi.fn().mockResolvedValue(true),
  MessageQuotaError: class MessageQuotaError extends Error {
    code: string;
    quota: unknown;

    constructor(code: string, message: string, options?: { quota?: unknown }) {
      super(message);
      this.name = "MessageQuotaError";
      this.code = code;
      this.quota = options?.quota ?? null;
    }
  },
  messageQuotaErrorCodes: {
    limitReached: "message-quota-exceeded",
    loadFailed: "message-quota-load-failed",
  },
}));
vi.mock("../attach-session-file", () => ({
  attachFileToSession: vi.fn().mockResolvedValue({
    attached: true,
    anthropicFileId: "file_1",
  }),
}));

const { consumeAnthropicSession } = await import("../session-runner");
const { buildKickoffText, getOrCreateSession } = await import("../session-kickoff");
const { buildSystemReminder } = await import("@/lib/runner/system-reminder");
const { completeRun, markStaleRunsFailed } = await import("@/lib/runner/run-lifecycle");
const { upsertMessage } = await import("@/lib/chat/messages");
const { deliverToExternalChannels } = await import("@/lib/channels/deliver");
const { runEvaluatorsForEvents } = await import("@/lib/eval/run-evaluators");
const {
  consumeMessageQuota,
  releaseMessageQuota,
} = await import("@/lib/usage/message-quota");
const { attachFileToSession } = await import("../attach-session-file");

async function collectStream<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader();
  const parts: T[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value !== undefined) parts.push(value);
  }
  return parts;
}

beforeEach(() => {
  vi.clearAllMocks();
  (getOrCreateSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "sess_1",
    created: true,
  });
  (attachFileToSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    attached: true,
    anthropicFileId: "file_1",
  });
  (consumeMessageQuota as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    allowed: true,
    clientId: "c1",
    planName: "Free",
    monthlyMessageLimit: 100,
    messagesUsed: 1,
    messagesRemaining: 99,
    periodStart: "2026-04-01",
    nextResetDate: "2026-05-01",
  });
  (releaseMessageQuota as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
});

describe("runManagedAgent — happy path", () => {
  it("wires session-runner callbacks to UIMessageStream writes, finalizes on end_turn", async () => {
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (options) => {
        await options.callbacks?.onSpanModelRequestStart?.({
          id: "span_1",
          type: "span.model_request_start",
        });
        await options.callbacks?.onAgentMessage?.({
          id: "evt_1",
          type: "agent.message",
          content: [{ type: "text", text: "Hello" }],
        });
        return {
          status: "complete",
          reason: "end_turn",
          accumulatedEvents: [
            { id: "span_1", type: "span.model_request_start" },
            {
              id: "evt_1",
              type: "agent.message",
              content: [{ type: "text", text: "Hello" }],
            },
          ],
          cost: {
            inputTokens: 50,
            outputTokens: 20,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            runtimeSeconds: 5,
          },
          approvalEventIds: [],
        };
      },
    );

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "hi",
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });

    const parts = await collectStream(stream);
    expect(
      parts.some((p) => (p as { type?: string }).type === "text-delta" || (p as { type?: string }).type === "text"),
    ).toBe(true);
    expect(completeRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "completed", runId: "run_1" }),
    );
    expect(upsertMessage).toHaveBeenCalled();
    expect(runEvaluatorsForEvents).toHaveBeenCalled();
  });

  it("consumes quota and persists the fresh user turn before starting the managed session", async () => {
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "complete",
      reason: "end_turn",
      accumulatedEvents: [],
      cost: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 0,
      },
      approvalEventIds: [],
    });

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "hi",
      userMessageSourceId: "user-msg-1",
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });

    await collectStream(stream);

    expect(consumeMessageQuota).toHaveBeenCalledWith(expect.anything(), "c1");
    expect(upsertMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        thread_id: "t1",
        role: "user",
        content: "hi",
        source_event_id: "user-msg-1",
      }),
    );
  });

  it("runs persistUserInput, getOrCreateSession, and buildSystemReminder in parallel after quota consumption", async () => {
    const events: string[] = [];

    (consumeMessageQuota as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        events.push("quota_start");
        await new Promise((resolve) => setTimeout(resolve, 0));
        events.push("quota_end");
        return {
          allowed: true,
          clientId: "c1",
          planName: "Free",
          monthlyMessageLimit: 100,
          messagesUsed: 1,
          messagesRemaining: 99,
          periodStart: "2026-04-01",
          nextResetDate: "2026-05-01",
        };
      },
    );
    (upsertMessage as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        events.push("persist_start");
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push("persist_end");
      },
    );
    (getOrCreateSession as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        events.push("session_start");
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push("session_end");
        return { id: "sess_1", created: false };
      },
    );
    (buildSystemReminder as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        events.push("reminder_start");
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push("reminder_end");
        return "<system-reminder>Current time: X</system-reminder>";
      },
    );
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "complete",
      reason: "end_turn",
      accumulatedEvents: [],
      cost: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 0,
      },
      approvalEventIds: [],
    });

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "hi",
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });

    await collectStream(stream);

    const quotaEnd = events.indexOf("quota_end");
    const persistStart = events.indexOf("persist_start");
    const sessionStart = events.indexOf("session_start");
    const reminderStart = events.indexOf("reminder_start");

    expect(quotaEnd).toBeLessThan(persistStart);
    expect(quotaEnd).toBeLessThan(sessionStart);
    expect(quotaEnd).toBeLessThan(reminderStart);

    const persistEnd = events.indexOf("persist_end");
    const sessionEnd = events.indexOf("session_end");
    const reminderEnd = events.indexOf("reminder_end");
    const lastStart = Math.max(persistStart, sessionStart, reminderStart);
    const firstEnd = Math.min(persistEnd, sessionEnd, reminderEnd);

    expect(lastStart).toBeLessThan(firstEnd);
  });

  it("seeds client profile and user preferences into the kickoff on the first turn of a new session", async () => {
    (getOrCreateSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "sess_new",
      created: true,
    });
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "complete",
      reason: "end_turn",
      accumulatedEvents: [],
      cost: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 0,
      },
      approvalEventIds: [],
    });

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "client_1",
      threadId: "thread_1",
      input: "Draft a follow-up to Kate",
      clientProfile: "## Client Profile\nJane — broker in SG",
      userPreferences: "## Preferences\nConcise. No fluff.",
      threadTitle: null,
    });

    await collectStream(stream);

    expect(buildKickoffText).toHaveBeenCalledWith(
      expect.objectContaining({
        clientProfile: "## Client Profile\nJane — broker in SG",
        userPreferences: "## Preferences\nConcise. No fluff.",
        userMessage: "Draft a follow-up to Kate",
      }),
    );
  });

  it("omits client profile and user preferences from the kickoff on subsequent turns of an existing session", async () => {
    (getOrCreateSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "sess_existing",
      created: false,
    });
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "complete",
      reason: "end_turn",
      accumulatedEvents: [],
      cost: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 0,
      },
      approvalEventIds: [],
    });

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "client_1",
      threadId: "thread_1",
      input: "Follow-up question",
      clientProfile: "## Client Profile\nJane — broker in SG",
      userPreferences: "## Preferences\nConcise. No fluff.",
      threadTitle: null,
    });

    await collectStream(stream);

    expect(buildKickoffText).toHaveBeenCalledWith(
      expect.objectContaining({
        clientProfile: null,
        userPreferences: null,
        userMessage: "Follow-up question",
      }),
    );
  });

  it("does not sweep stale runs on the hot path", async () => {
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "complete",
      reason: "end_turn",
      accumulatedEvents: [],
      cost: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 0,
      },
      approvalEventIds: [],
    });

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "hi",
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });

    await collectStream(stream);

    expect(markStaleRunsFailed).not.toHaveBeenCalled();
  });
});

describe("runManagedAgent — terminal variants", () => {
  it("persists partial output and scores retries_exhausted terminal failures", async () => {
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "failed",
      reason: "retries_exhausted",
      accumulatedEvents: [
        {
          id: "evt_1",
          type: "agent.message",
          content: [{ type: "text", text: "I got partway through this." }],
        },
        {
          id: "evt_terminal",
          type: "session.status_idle",
          stop_reason: { type: "retries_exhausted" },
        },
      ],
      cost: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 1,
      },
      approvalEventIds: [],
    });

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "hi",
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });
    await collectStream(stream);
    expect(completeRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "failed" }),
    );
    expect(upsertMessage).toHaveBeenCalled();
    expect(deliverToExternalChannels).toHaveBeenCalled();
    expect(runEvaluatorsForEvents).toHaveBeenCalled();
  });

  it("does not mark run complete when reason is requires_action", async () => {
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "complete",
      reason: "requires_action",
      accumulatedEvents: [
        {
          id: "evt_1",
          type: "agent.message",
          content: [{ type: "text", text: "pending approval" }],
        },
      ],
      cost: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 1,
      },
      approvalEventIds: ["tu_1"],
    });

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "rm -rf /tmp",
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });
    await collectStream(stream);
    expect(completeRun).not.toHaveBeenCalled();
    expect(upsertMessage).toHaveBeenCalled();
  });
});

describe("runManagedAgent — source_event_id idempotency", () => {
  it("upserts the assistant message keyed by the terminal event id", async () => {
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "complete",
      reason: "end_turn",
      accumulatedEvents: [
        { id: "span_1", type: "span.model_request_start" },
        {
          id: "evt_1",
          type: "agent.message",
          content: [{ type: "text", text: "Hello" }],
        },
        {
          id: "evt_terminal",
          type: "session.status_idle",
          stop_reason: { type: "end_turn" },
        },
      ],
      cost: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 1,
      },
      approvalEventIds: [],
    });

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "hi",
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });
    await collectStream(stream);
    expect(upsertMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        thread_id: "t1",
        role: "assistant",
        source_event_id: "evt_terminal",
      }),
    );
    expect(deliverToExternalChannels).toHaveBeenCalledWith(
      expect.anything(),
      "t1",
      "c1",
      expect.any(String),
      expect.any(Array),
      "evt_terminal",
    );
  });
});

describe("runManagedAgent — failure cleanup", () => {
  it("marks the run failed when setup throws after the lock is acquired", async () => {
    (getOrCreateSession as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("missing managed agent env"),
    );

    const { runManagedAgent } = await import("../adapter");

    await expect(
      runManagedAgent({
        anthropic: {} as never,
        supabase: {} as never,
        clientId: "c1",
        threadId: "t1",
        input: "hi",
        clientProfile: null,
        userPreferences: null,
        threadTitle: null,
      }),
    ).rejects.toThrow("missing managed agent env");

    expect(completeRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "failed", runId: "run_1" }),
    );
  });

  it("releases the consumed quota if user-turn persistence fails before the run starts", async () => {
    (upsertMessage as unknown as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("insert failed"));

    const { runManagedAgent } = await import("../adapter");

    await expect(
      runManagedAgent({
        anthropic: {} as never,
        supabase: {} as never,
        clientId: "c1",
        threadId: "t1",
        input: "hi",
        userMessageSourceId: "user-msg-1",
        clientProfile: null,
        userPreferences: null,
        threadTitle: null,
      }),
    ).rejects.toThrow("insert failed");

    expect(releaseMessageQuota).toHaveBeenCalledWith(
      expect.anything(),
      "c1",
      "2026-04-01",
    );
  });

  it("marks the run failed when consumeAnthropicSession throws mid-stream", async () => {
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("upstream EPIPE"),
    );

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "hi",
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });
    // Drain the stream — the error happens inside execute and the
    // UIMessageStream surfaces it via the consumer; we just need the
    // adapter to have run its cleanup.
    try {
      await collectStream(stream);
    } catch {
      // expected
    }
    expect(completeRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "failed", runId: "run_1" }),
    );
  });

  it("attaches file parts only after the managed session exists", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(new Blob(["brief"], { type: "application/pdf" }), { status: 200 }),
    );
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "complete",
      reason: "end_turn",
      accumulatedEvents: [],
      cost: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 0,
      },
      approvalEventIds: [],
    });

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "see attached",
      fileParts: [{
        type: "file",
        url: "https://storage.example.com/brief.pdf",
        mediaType: "application/pdf",
        filename: "brief.pdf",
      }],
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });

    await collectStream(stream);

    expect(globalThis.fetch).toHaveBeenCalledWith("https://storage.example.com/brief.pdf");
    expect(attachFileToSession).toHaveBeenCalledWith({
      sessionId: "sess_1",
      file: expect.anything(),
      filename: "brief.pdf",
    });
  });
});

describe("runManagedAgent — pipeJsonRender spec fences", () => {
  it("emits data-spec parts when agent.message contains a spec fence", async () => {
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (options) => {
        const specText =
          'Here is the data:\n```spec\n{"op":"replace","path":"/m","value":1}\n```\nDone.';
        await options.callbacks?.onAgentMessage?.({
          id: "evt_1",
          type: "agent.message",
          content: [{ type: "text", text: specText }],
        });
        return {
          status: "complete",
          reason: "end_turn",
          accumulatedEvents: [
            {
              id: "evt_1",
              type: "agent.message",
              content: [{ type: "text", text: specText }],
            },
          ],
          cost: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 1,
      },
          approvalEventIds: [],
        };
      },
    );

    const { runManagedAgent } = await import("../adapter");
    const stream = await runManagedAgent({
      anthropic: {} as never,
      supabase: {} as never,
      clientId: "c1",
      threadId: "t1",
      input: "show me",
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });
    const parts = await collectStream(stream);
    const types = parts.map((p) => (p as { type?: string }).type ?? "");
    expect(types.some((t) => t.startsWith("data-"))).toBe(true);
  });
});
