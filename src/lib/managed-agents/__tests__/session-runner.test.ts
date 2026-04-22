/**
 * @module lib/managed-agents/__tests__/session-runner.test
 *
 * Tests for `consumeAnthropicSession` — the reusable session-runner core
 * shared by the chat adapter and H5's Trigger.dev listener. We mock the
 * reconnect iterator, dispatcher, and approval queries so each behaviour
 * can be tested in isolation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../session-reconnect", () => ({
  // Matches the real `openSessionTail` signature — it returns a Promise
  // that the session runner awaits before sending the kickoff. Returning
  // a sync handle here would let the "handle.live is not async iterable"
  // regression slip through unit tests again.
  openSessionTail: vi.fn(() =>
    Promise.resolve({
      live: { [Symbol.asyncIterator]: async function* () {} },
      afterId: null,
    }),
  ),
  iterateSessionEventsAfter: vi.fn(),
}));

vi.mock("../dispatcher", () => ({
  dispatchCustomTool: vi.fn().mockResolvedValue({
    custom_tool_use_id: "ctu_1",
    content: [{ type: "text", text: '{"success":true,"records":[]}' }],
  }),
}));

vi.mock("@/lib/approvals/queries", () => ({
  createApprovalEvent: vi
    .fn()
    .mockResolvedValue({ success: true, status: "created" }),
}));

const { iterateSessionEventsAfter, openSessionTail } = await import("../session-reconnect");
const { dispatchCustomTool } = await import("../dispatcher");
const { createApprovalEvent } = await import("@/lib/approvals/queries");
const { consumeAnthropicSession } = await import("../session-runner");

import {
  agentMessageTextEvent,
  bashToolUseEvent,
  customToolUseEvent,
  modelRequestEndEvent,
  modelRequestStartEvent,
  sessionErrorEvent,
  statusIdleEvent,
  statusTerminatedEvent,
} from "./fixtures/events";

const sendEvent = vi.fn().mockResolvedValue(undefined);
const retrieveSession = vi
  .fn()
  .mockResolvedValue({ stats: { active_seconds: 0 } });

function fakeAnthropic() {
  return {
    beta: {
      sessions: {
        events: { send: sendEvent },
        retrieve: retrieveSession,
      },
    },
  } as never;
}

function stubIteration(events: unknown[]) {
  (iterateSessionEventsAfter as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    function () {
      const gen = (async function* () {
        for (const e of events) yield e;
      })();
      return gen;
    },
  );
}

function baseContext() {
  return {
    supabase: {} as never,
    clientId: "c1",
    threadId: "t1",
    isChatContext: true,
  };
}

beforeEach(() => {
  sendEvent.mockClear();
  retrieveSession.mockClear();
  retrieveSession.mockResolvedValue({ stats: { active_seconds: 0 } });
  (iterateSessionEventsAfter as unknown as ReturnType<typeof vi.fn>).mockReset();
  (openSessionTail as unknown as ReturnType<typeof vi.fn>).mockClear();
  (openSessionTail as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    live: { [Symbol.asyncIterator]: async function* () {} },
    afterId: null,
  });
  (dispatchCustomTool as unknown as ReturnType<typeof vi.fn>).mockReset();
  (dispatchCustomTool as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    custom_tool_use_id: "ctu_1",
    content: [{ type: "text", text: '{"success":true,"records":[]}' }],
  });
  (createApprovalEvent as unknown as ReturnType<typeof vi.fn>).mockClear();
});

describe("consumeAnthropicSession — happy path", () => {
  it("opens the live stream via openSessionTail BEFORE sending the kickoff", async () => {
    stubIteration([
      modelRequestStartEvent("span_1"),
      agentMessageTextEvent("evt_1", "hello"),
      modelRequestEndEvent("span_1_end", 100, 25),
      statusIdleEvent("evt_idle", "end_turn"),
    ]);

    await consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: baseContext(),
      kickoffContent: [{ type: "text", text: "hi there" }],
    });

    // openSessionTail is the eager helper that synchronously calls
    // events.stream(); skill §7 requires it to fire BEFORE events.send.
    const openOrder = (
      openSessionTail as unknown as ReturnType<typeof vi.fn>
    ).mock.invocationCallOrder[0];
    const sendOrder = sendEvent.mock.invocationCallOrder[0];
    expect(openOrder).toBeDefined();
    expect(sendOrder).toBeDefined();
    expect(openOrder).toBeLessThan(sendOrder);
    expect(openSessionTail).toHaveBeenCalledWith(
      expect.anything(),
      "sess_1",
    );

    expect(sendEvent).toHaveBeenCalledWith(
      "sess_1",
      expect.objectContaining({
        events: [
          {
            type: "user.message",
            content: [{ type: "text", text: "hi there" }],
          },
        ],
      }),
      expect.objectContaining({
        timeout: 2_500,
        maxRetries: 0,
      }),
    );
  });

  it("skips history replay when the pre-kickoff tail has no prior events", async () => {
    stubIteration([
      agentMessageTextEvent("evt_1", "hello"),
      statusIdleEvent("evt_idle", "end_turn"),
    ]);

    await consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: baseContext(),
      kickoffContent: [{ type: "text", text: "hi there" }],
    });

    expect(iterateSessionEventsAfter).toHaveBeenCalledWith(
      expect.anything(),
      "sess_1",
      expect.objectContaining({ afterId: null }),
      { preferLiveOnly: true },
    );
  });

  it("uses the live stream directly for warm turns opened before kickoff", async () => {
    (openSessionTail as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      live: { [Symbol.asyncIterator]: async function* () {} },
      afterId: "evt_prev",
    });

    stubIteration([
      agentMessageTextEvent("evt_1", "hello"),
      statusIdleEvent("evt_idle", "end_turn"),
    ]);

    await consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: baseContext(),
      kickoffContent: [{ type: "text", text: "hi there" }],
    });

    expect(iterateSessionEventsAfter).toHaveBeenCalledWith(
      expect.anything(),
      "sess_1",
      expect.objectContaining({ afterId: "evt_prev" }),
      { preferLiveOnly: true },
    );
  });

  it("returns end_turn terminal with accumulated cost", async () => {
    stubIteration([
      modelRequestEndEvent("span_1_end", 100, 25),
      statusIdleEvent("evt_idle", "end_turn"),
    ]);

    const result = await consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: baseContext(),
    });

    expect(result.status).toBe("complete");
    expect(result.reason).toBe("end_turn");
    expect(result.cost.inputTokens).toBe(100);
    expect(result.cost.outputTokens).toBe(25);
    expect(retrieveSession).toHaveBeenCalledWith(
      "sess_1",
      {},
      expect.objectContaining({
        timeout: 2_500,
        maxRetries: 0,
      }),
    );
  });

  it("fires onAgentMessage + onSpanModelRequestStart callbacks in order", async () => {
    stubIteration([
      modelRequestStartEvent("span_1"),
      agentMessageTextEvent("evt_1", "hello"),
      statusIdleEvent("evt_idle", "end_turn"),
    ]);

    const order: string[] = [];
    const onAgentMessage = vi.fn(() => {
      order.push("msg");
    });
    const onSpanModelRequestStart = vi.fn(() => {
      order.push("start");
    });

    await consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: baseContext(),
      callbacks: { onAgentMessage, onSpanModelRequestStart },
    });

    expect(order).toEqual(["start", "msg"]);
  });

  it("emits incremental snapshots when persistIncrementally is enabled", async () => {
    stubIteration([
      modelRequestStartEvent("span_1"),
      agentMessageTextEvent("evt_1", "hello"),
      statusIdleEvent("evt_idle", "end_turn"),
    ]);
    const onAccumulatedEventsUpdated = vi.fn();

    await consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: baseContext(),
      persistIncrementally: true,
      callbacks: { onAccumulatedEventsUpdated },
    });

    expect(onAccumulatedEventsUpdated).toHaveBeenCalledTimes(2);
    expect(onAccumulatedEventsUpdated).toHaveBeenNthCalledWith(
      1,
      [expect.objectContaining({ type: "span.model_request_start" })],
    );
    expect(onAccumulatedEventsUpdated).toHaveBeenNthCalledWith(
      2,
      [
        expect.objectContaining({ type: "span.model_request_start" }),
        expect.objectContaining({ type: "agent.message" }),
      ],
    );
  });
});

describe("consumeAnthropicSession — custom tool dispatch", () => {
  it("dispatches custom tool calls and sends user.custom_tool_result back to the session", async () => {
    stubIteration([
      customToolUseEvent("ctu_1", "search_crm", { entity: "contacts" }),
      statusIdleEvent("evt_idle", "end_turn"),
    ]);
    const onAgentToolUse = vi.fn();
    const onAgentToolResult = vi.fn();

    await consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: baseContext(),
      callbacks: { onAgentToolUse, onAgentToolResult },
    });

    expect(dispatchCustomTool).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ctu_1",
        name: "search_crm",
        input: { entity: "contacts" },
      }),
      expect.objectContaining({ isChatContext: true, clientId: "c1" }),
    );

    const sendCall = sendEvent.mock.calls.find(([, body]) =>
      (body as { events: Array<{ type: string }> }).events.some(
        (e) => e.type === "user.custom_tool_result",
      ),
    );
    expect(sendCall).toBeDefined();

    expect(onAgentToolUse).toHaveBeenCalled();
    expect(onAgentToolResult).toHaveBeenCalled();
  });

  it("preserves custom tool error state on the immediate callback and session event", async () => {
    stubIteration([
      customToolUseEvent("ctu_1", "create_connection", {
        integrations: ["notion"],
      }),
      statusIdleEvent("evt_idle", "end_turn"),
    ]);
    (dispatchCustomTool as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      custom_tool_use_id: "ctu_1",
      content: [{ type: "text", text: '{"success":false,"error":"bad input"}' }],
      is_error: true,
    });
    const onAgentToolResult = vi.fn();

    await consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: baseContext(),
      callbacks: { onAgentToolResult },
    });

    expect(sendEvent).toHaveBeenCalledWith(
      "sess_1",
      expect.objectContaining({
        events: [
          expect.objectContaining({
            type: "user.custom_tool_result",
            custom_tool_use_id: "ctu_1",
            is_error: true,
          }),
        ],
      }),
      expect.anything(),
    );

    expect(onAgentToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "user.custom_tool_result",
        custom_tool_use_id: "ctu_1",
        is_error: true,
      }),
    );
  });
});

describe("consumeAnthropicSession — approvals", () => {
  it("chat mode: creates approval_events row and returns requires_action on status_idle", async () => {
    stubIteration([
      bashToolUseEvent("tu_1", "rm -rf /tmp", "ask"),
      statusIdleEvent("evt_idle", "requires_action"),
    ]);
    const onApprovalRequired = vi.fn();

    const result = await consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: baseContext(),
      autoDenyApprovals: false,
      callbacks: { onApprovalRequired },
    });

    expect(createApprovalEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        clientId: "c1",
        threadId: "t1",
        runId: "run_1",
        toolName: "bash",
        approvalId: "tu_1",
        sessionId: "sess_1",
        toolUseId: "tu_1",
      }),
    );
    expect(onApprovalRequired).toHaveBeenCalled();
    expect(result.reason).toBe("requires_action");
    expect(result.status).toBe("complete");
    expect(result.approvalEventIds).toEqual(["tu_1"]);

    // Adapter MUST NOT send user.tool_confirmation in chat mode
    const confirmCall = sendEvent.mock.calls.find(([, body]) =>
      (body as { events: Array<{ type: string }> }).events.some(
        (e) => e.type === "user.tool_confirmation",
      ),
    );
    expect(confirmCall).toBeUndefined();
  });

  it("trigger mode: auto-denies bash approval and continues until end_turn", async () => {
    stubIteration([
      bashToolUseEvent("tu_1", "rm -rf /tmp", "ask"),
      statusIdleEvent("evt_idle_req", "requires_action"),
      agentMessageTextEvent("evt_resumed", "Cannot run bash here, reporting back."),
      statusIdleEvent("evt_idle_end", "end_turn"),
    ]);

    const result = await consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: { ...baseContext(), isChatContext: false },
      autoDenyApprovals: true,
      autoDenyMessage: "Approval-gated tools are not available in trigger runs.",
    });

    expect(result.status).toBe("complete");
    expect(result.reason).toBe("end_turn");

    const denyCall = sendEvent.mock.calls.find(([, body]) =>
      (body as { events: Array<{ type: string; result?: string }> }).events.some(
        (e) => e.type === "user.tool_confirmation" && e.result === "deny",
      ),
    );
    expect(denyCall).toBeDefined();
    expect(createApprovalEvent).not.toHaveBeenCalled();
  });

  it("throws when approval persistence fails", async () => {
    (createApprovalEvent as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      status: "error",
      error: "write failed",
    });
    stubIteration([
      bashToolUseEvent("tu_1", "rm -rf /tmp", "ask"),
      statusIdleEvent("evt_idle", "requires_action"),
    ]);

    await expect(
      consumeAnthropicSession({
        anthropic: fakeAnthropic(),
        sessionId: "sess_1",
        runId: "run_1",
        context: baseContext(),
        autoDenyApprovals: false,
      }),
    ).rejects.toThrow("Failed to persist approval event tu_1: write failed");
  });

  it("fires onKickoffApprovalSent after sending user.tool_confirmation", async () => {
    stubIteration([statusIdleEvent("evt_idle", "end_turn")]);
    const onKickoffApprovalSent = vi.fn();

    await consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: baseContext(),
      kickoffApproval: {
        toolUseId: "tu_1",
        result: "allow",
      },
      onKickoffApprovalSent,
    });

    expect(onKickoffApprovalSent).toHaveBeenCalledTimes(1);
    expect(sendEvent).toHaveBeenCalledWith(
      "sess_1",
      expect.objectContaining({
        events: [
          {
            type: "user.tool_confirmation",
            tool_use_id: "tu_1",
            result: "allow",
          },
        ],
      }),
      expect.objectContaining({
        timeout: 2_500,
        maxRetries: 0,
      }),
    );
  });

  it("fires onKickoffCustomToolResultSent after sending user.custom_tool_result", async () => {
    stubIteration([statusIdleEvent("evt_idle", "end_turn")]);
    const onKickoffCustomToolResultSent = vi.fn();

    await consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: baseContext(),
      kickoffCustomToolResult: {
        custom_tool_use_id: "toolu_1",
        content: [{ type: "text", text: '{"success":true,"approved":true}' }],
      },
      onKickoffCustomToolResultSent,
    });

    expect(onKickoffCustomToolResultSent).toHaveBeenCalledTimes(1);
    expect(sendEvent).toHaveBeenCalledWith(
      "sess_1",
      expect.objectContaining({
        events: [
          {
            type: "user.custom_tool_result",
            custom_tool_use_id: "toolu_1",
            content: [{ type: "text", text: '{"success":true,"approved":true}' }],
          },
        ],
      }),
      expect.objectContaining({
        timeout: 2_500,
        maxRetries: 0,
      }),
    );
  });

  it("defers request_approval and waits at requires_action without sending user.custom_tool_result", async () => {
    stubIteration([
      customToolUseEvent("toolu_request_1", "request_approval", {
        summary: "Delete 3 duplicate contacts",
        action_type: "crm.delete_records",
      }),
      statusIdleEvent("evt_idle", "requires_action"),
    ]);
    (dispatchCustomTool as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      kind: "deferred",
      toolUseId: "toolu_request_1",
      toolName: "request_approval",
      toolInput: {
        summary: "Delete 3 duplicate contacts",
        action_type: "crm.delete_records",
      },
    });

    const result = await consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: baseContext(),
      callbacks: { onApprovalRequired: vi.fn() },
    });

    expect(createApprovalEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        approvalId: "toolu_request_1",
        toolName: "request_approval",
      }),
    );
    expect(
      sendEvent.mock.calls.some(([, body]) =>
        (body as { events: Array<{ type: string }> }).events.some(
          (event) => event.type === "user.custom_tool_result",
        ),
      ),
    ).toBe(false);
    expect(result.reason).toBe("requires_action");
  });
});

describe("consumeAnthropicSession — terminal variants + cost", () => {
  it("marks retries_exhausted as failed", async () => {
    stubIteration([statusIdleEvent("evt_idle", "retries_exhausted")]);
    const result = await consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: baseContext(),
    });
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("retries_exhausted");
  });

  it("marks session.status_terminated as failed", async () => {
    stubIteration([statusTerminatedEvent("term_1")]);
    const result = await consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: baseContext(),
    });
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("terminated");
  });

  it("logs session.error via onSessionError without terminating", async () => {
    stubIteration([
      sessionErrorEvent("err_1", "transient upstream timeout"),
      agentMessageTextEvent("evt_resumed", "recovered"),
      statusIdleEvent("evt_idle", "end_turn"),
    ]);
    const onSessionError = vi.fn();
    const result = await consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: baseContext(),
      callbacks: { onSessionError },
    });
    expect(onSessionError).toHaveBeenCalled();
    expect(result.status).toBe("complete");
    expect(result.reason).toBe("end_turn");
  });

  it("includes session runtime in the returned cost", async () => {
    retrieveSession.mockResolvedValueOnce({ stats: { active_seconds: 120 } });
    stubIteration([
      modelRequestEndEvent("span_1_end", 200, 100),
      statusIdleEvent("evt_idle", "end_turn"),
    ]);
    const result = await consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: baseContext(),
    });
    expect(result.cost.runtimeSeconds).toBe(120);
    expect(result.cost.inputTokens).toBe(200);
    expect(result.cost.outputTokens).toBe(100);
  });

  it("returns cache_read and cache_creation tokens in cost", async () => {
    stubIteration([
      {
        id: "span_1_end",
        type: "span.model_request_end",
        model_usage: {
          input_tokens: 1500,
          output_tokens: 100,
          cache_read_input_tokens: 800,
          cache_creation_input_tokens: 200,
        },
      },
      statusIdleEvent("evt_idle", "end_turn"),
    ]);
    const result = await consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: baseContext(),
    });
    expect(result.cost.inputTokens).toBe(1500);
    expect(result.cost.cacheReadInputTokens).toBe(800);
    expect(result.cost.cacheCreationInputTokens).toBe(200);
  });
});

describe("consumeAnthropicSession — callback failure resilience (client disconnect)", () => {
  it("completes custom tool dispatch even when callbacks throw (simulating dead stream)", async () => {
    stubIteration([
      customToolUseEvent("ctu_1", "storage_write", { op: "write", path: "/agent/out.csv" }),
      statusIdleEvent("evt_idle", "end_turn"),
    ]);

    const throwingCallback = vi.fn(() => {
      throw new Error("WritableStream closed — client navigated away");
    });

    const result = await consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: baseContext(),
      callbacks: {
        onAgentToolUse: throwingCallback,
        onAgentToolResult: throwingCallback,
      },
    });

    // Tool dispatch must still complete despite callback failures.
    expect(dispatchCustomTool).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ctu_1", name: "storage_write" }),
      expect.anything(),
    );

    // Tool result must still be sent back to Anthropic.
    const sendCall = sendEvent.mock.calls.find(([, body]) =>
      (body as { events: Array<{ type: string }> }).events.some(
        (e) => e.type === "user.custom_tool_result",
      ),
    );
    expect(sendCall).toBeDefined();

    // Runner must return normally so the adapter can call finalizeRun.
    expect(result.status).toBe("complete");
    expect(result.reason).toBe("end_turn");
  });

  it("completes approval persistence even when onApprovalRequired callback throws", async () => {
    stubIteration([
      bashToolUseEvent("tu_1", "rm -rf /tmp", "ask"),
      statusIdleEvent("evt_idle", "requires_action"),
    ]);

    const result = await consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: baseContext(),
      autoDenyApprovals: false,
      callbacks: {
        onApprovalRequired: vi.fn(() => {
          throw new Error("WritableStream closed");
        }),
      },
    });

    // Approval event must still be persisted to DB.
    expect(createApprovalEvent).toHaveBeenCalled();
    expect(result.reason).toBe("requires_action");
    expect(result.approvalEventIds).toEqual(["tu_1"]);
  });
});

// Incremental persistence was removed in F8: the runner no longer
// fires onPersistMessage. The chat adapter persists the full assistant
// message via upsertMessage at terminal time, keyed by the terminal
// event id for run-restart idempotency.
