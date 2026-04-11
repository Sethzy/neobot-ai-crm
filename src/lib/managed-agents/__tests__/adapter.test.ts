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
  buildKickoffText: () => "kickoff",
  getOrCreateSession: vi
    .fn()
    .mockResolvedValue({ id: "sess_1", created: true }),
}));
vi.mock("@/lib/runner/system-reminder", () => ({
  buildSystemReminder: vi.fn().mockResolvedValue("<reminder>ok</reminder>"),
}));
vi.mock("@/lib/runner/run-lifecycle", () => ({
  createRun: vi.fn().mockResolvedValue({ created: true, runId: "run_1" }),
  completeRun: vi.fn().mockResolvedValue(undefined),
  markStaleRunsFailed: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/chat/messages", () => ({
  createMessages: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/eval/run-evaluators", () => ({
  runEvaluatorsForEvents: vi.fn().mockResolvedValue(undefined),
}));

const { consumeAnthropicSession } = await import("../session-runner");
const { completeRun } = await import("@/lib/runner/run-lifecycle");
const { createMessages } = await import("@/lib/chat/messages");
const { runEvaluatorsForEvents } = await import("@/lib/eval/run-evaluators");

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
          cost: { inputTokens: 50, outputTokens: 20, runtimeSeconds: 5 },
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
    expect(createMessages).toHaveBeenCalled();
    expect(runEvaluatorsForEvents).toHaveBeenCalled();
  });
});

describe("runManagedAgent — terminal variants", () => {
  it("marks run failed on retries_exhausted", async () => {
    (consumeAnthropicSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "failed",
      reason: "retries_exhausted",
      accumulatedEvents: [],
      cost: { inputTokens: 0, outputTokens: 0, runtimeSeconds: 0 },
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
      cost: { inputTokens: 10, outputTokens: 5, runtimeSeconds: 1 },
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
    expect(createMessages).toHaveBeenCalled();
  });
});

describe("runManagedAgent — failure cleanup", () => {
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
          cost: { inputTokens: 10, outputTokens: 5, runtimeSeconds: 1 },
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
