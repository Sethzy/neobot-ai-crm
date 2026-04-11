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
  openSessionStream: vi.fn(() => ({ live: { [Symbol.asyncIterator]: async function* () {} } })),
  iterateSessionEvents: vi.fn(),
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

const { iterateSessionEvents, openSessionStream } = await import("../session-reconnect");
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
  (iterateSessionEvents as unknown as ReturnType<typeof vi.fn>).mockImplementation(
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
  (iterateSessionEvents as unknown as ReturnType<typeof vi.fn>).mockReset();
  (openSessionStream as unknown as ReturnType<typeof vi.fn>).mockClear();
  (openSessionStream as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    live: { [Symbol.asyncIterator]: async function* () {} },
  });
  (dispatchCustomTool as unknown as ReturnType<typeof vi.fn>).mockClear();
  (createApprovalEvent as unknown as ReturnType<typeof vi.fn>).mockClear();
});

describe("consumeAnthropicSession — happy path", () => {
  it("opens the live stream via openSessionStream BEFORE sending the kickoff", async () => {
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
      kickoffMessage: "hi there",
      persistIncrementally: false,
    });

    // openSessionStream is the eager helper that synchronously calls
    // events.stream(); skill §7 requires it to fire BEFORE events.send.
    const openOrder = (
      openSessionStream as unknown as ReturnType<typeof vi.fn>
    ).mock.invocationCallOrder[0];
    const sendOrder = sendEvent.mock.invocationCallOrder[0];
    expect(openOrder).toBeDefined();
    expect(sendOrder).toBeDefined();
    expect(openOrder).toBeLessThan(sendOrder);
    expect(openSessionStream).toHaveBeenCalledWith(
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
      persistIncrementally: false,
    });

    expect(result.status).toBe("complete");
    expect(result.reason).toBe("end_turn");
    expect(result.cost.inputTokens).toBe(100);
    expect(result.cost.outputTokens).toBe(25);
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
      persistIncrementally: false,
    });

    expect(order).toEqual(["start", "msg"]);
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
      persistIncrementally: false,
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
      persistIncrementally: false,
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
      persistIncrementally: false,
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
});

describe("consumeAnthropicSession — terminal variants + cost", () => {
  it("marks retries_exhausted as failed", async () => {
    stubIteration([statusIdleEvent("evt_idle", "retries_exhausted")]);
    const result = await consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: baseContext(),
      persistIncrementally: false,
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
      persistIncrementally: false,
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
      persistIncrementally: false,
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
      persistIncrementally: false,
    });
    expect(result.cost.runtimeSeconds).toBe(120);
    expect(result.cost.inputTokens).toBe(200);
    expect(result.cost.outputTokens).toBe(100);
  });
});

describe("consumeAnthropicSession — incremental persistence", () => {
  it("fires onPersistMessage for each agent.message with source_event_id", async () => {
    stubIteration([
      modelRequestStartEvent("span_1"),
      agentMessageTextEvent("evt_1", "Hello"),
      agentMessageTextEvent("evt_2", " world"),
      statusIdleEvent("evt_idle", "end_turn"),
    ]);
    const onPersistMessage = vi.fn();

    await consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: baseContext(),
      callbacks: { onPersistMessage },
      persistIncrementally: true,
    });

    const calls = onPersistMessage.mock.calls;
    const sourceEventIds = calls.map(([, sourceEventId]) => sourceEventId);
    expect(sourceEventIds).toContain("evt_1");
    expect(sourceEventIds).toContain("evt_2");
  });

  it("does not fire onPersistMessage when persistIncrementally is false", async () => {
    stubIteration([
      agentMessageTextEvent("evt_1", "hello"),
      statusIdleEvent("evt_idle", "end_turn"),
    ]);
    const onPersistMessage = vi.fn();
    await consumeAnthropicSession({
      anthropic: fakeAnthropic(),
      sessionId: "sess_1",
      runId: "run_1",
      context: baseContext(),
      callbacks: { onPersistMessage },
      persistIncrementally: false,
    });
    expect(onPersistMessage).not.toHaveBeenCalled();
  });
});
