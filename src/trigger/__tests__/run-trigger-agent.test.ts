/**
 * Tests for the per-trigger Managed Agents listener task.
 * @module src/trigger/__tests__/run-trigger-agent
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  consumeAnthropicSession,
  finalizeTriggerRun,
  persistTriggerRunSnapshot,
  createAdminClient,
  getAnthropicClient,
} = vi.hoisted(() => ({
  consumeAnthropicSession: vi.fn(),
  finalizeTriggerRun: vi.fn(),
  persistTriggerRunSnapshot: vi.fn().mockResolvedValue(undefined),
  createAdminClient: vi.fn().mockResolvedValue({ __role: "service" }),
  getAnthropicClient: vi.fn().mockReturnValue({ __anthropic: true }),
}));

vi.mock("@/lib/managed-agents/session-runner", () => ({
  consumeAnthropicSession,
}));
vi.mock("@/lib/managed-agents/finalize-trigger-run", () => ({
  finalizeTriggerRun,
  persistTriggerRunSnapshot,
}));
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient,
}));
vi.mock("@/lib/managed-agents/anthropic-client", () => ({
  getAnthropicClient,
}));
vi.mock("@trigger.dev/sdk/v3", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
  task: (definition: unknown) => definition,
}));

import { runTriggerAgent } from "../run-trigger-agent";

describe("runTriggerAgent", () => {
  beforeEach(() => {
    consumeAnthropicSession.mockReset();
    finalizeTriggerRun.mockReset();
    persistTriggerRunSnapshot.mockReset();
    createAdminClient.mockClear();
    getAnthropicClient.mockClear();
  });

  it("invokes the session runner with trigger-context flags", async () => {
    consumeAnthropicSession.mockResolvedValue({
      status: "complete",
      reason: "end_turn",
      accumulatedEvents: [],
      cost: {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        runtimeSeconds: 12,
      },
      approvalEventIds: [],
    });

    await runTriggerAgent.run(
      {
        runId: "run_1",
        sessionId: "session_1",
        clientId: "client_1",
        threadId: "thread_1",
      },
      { ctx: {} as never },
    );

    expect(consumeAnthropicSession).toHaveBeenCalledWith(
      expect.objectContaining({
        anthropic: { __anthropic: true },
        runId: "run_1",
        sessionId: "session_1",
        context: expect.objectContaining({
          supabase: { __role: "service" },
          clientId: "client_1",
          threadId: "thread_1",
          isChatContext: false,
        }),
        autoDenyApprovals: true,
        persistIncrementally: true,
        callbacks: expect.objectContaining({
          onAccumulatedEventsUpdated: expect.any(Function),
        }),
        onTerminal: expect.any(Function),
      }),
    );
  });

  it("persists trigger snapshots incrementally when the listener receives assistant-visible events", async () => {
    consumeAnthropicSession.mockImplementation(
      async (options: {
        callbacks?: { onAccumulatedEventsUpdated?: (events: unknown[]) => Promise<void> };
      }) => {
        await options.callbacks?.onAccumulatedEventsUpdated?.([
          {
            id: "evt_msg",
            type: "agent.message",
            content: [{ type: "text", text: "Working on it." }],
          },
        ]);

        return {
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
        };
      },
    );

    await runTriggerAgent.run(
      {
        runId: "run_1",
        sessionId: "session_1",
        clientId: "client_1",
        threadId: "thread_1",
      },
      { ctx: {} as never },
    );

    expect(persistTriggerRunSnapshot).toHaveBeenCalledWith(
      { __role: "service" },
      {
        runId: "run_1",
        threadId: "thread_1",
        events: [
          {
            id: "evt_msg",
            type: "agent.message",
            content: [{ type: "text", text: "Working on it." }],
          },
        ],
      },
    );
  });

  it("calls finalizeTriggerRun via the onTerminal callback", async () => {
    consumeAnthropicSession.mockImplementation(
      async (options: {
        onTerminal?: (events: unknown[], cost: unknown) => Promise<void>;
      }) => {
        await options.onTerminal?.(
          [{ id: "evt_1", type: "session.status_idle", stop_reason: { type: "end_turn" } }],
          {
            inputTokens: 100,
            outputTokens: 50,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            runtimeSeconds: 12,
          },
        );

        return {
          status: "complete",
          reason: "end_turn",
          accumulatedEvents: [],
          cost: {
            inputTokens: 100,
            outputTokens: 50,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            runtimeSeconds: 12,
          },
          approvalEventIds: [],
        };
      },
    );

    await runTriggerAgent.run(
      {
        runId: "run_1",
        sessionId: "session_1",
        clientId: "client_1",
        threadId: "thread_1",
      },
      { ctx: {} as never },
    );

    expect(finalizeTriggerRun).toHaveBeenCalledWith(
      { __role: "service" },
      {
        runId: "run_1",
        threadId: "thread_1",
        clientId: "client_1",
        events: [
          {
            id: "evt_1",
            type: "session.status_idle",
            stop_reason: { type: "end_turn" },
          },
        ],
        cost: {
          inputTokens: 100,
          outputTokens: 50,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          runtimeSeconds: 12,
        },
      },
    );
  });

  it("is safe to re-run for Trigger.dev retries", async () => {
    const terminalEvents = [
      {
        id: "evt_terminal",
        type: "session.status_idle",
        stop_reason: { type: "end_turn" },
      },
    ];
    const terminalCost = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      runtimeSeconds: 0,
    };

    consumeAnthropicSession.mockImplementation(
      async (options: {
        onTerminal?: (events: unknown[], cost: unknown) => Promise<void>;
      }) => {
        await options.onTerminal?.(terminalEvents, terminalCost);

        return {
          status: "complete",
          reason: "end_turn",
          accumulatedEvents: terminalEvents,
          cost: terminalCost,
          approvalEventIds: [],
        };
      },
    );

    const payload = {
      runId: "run_1",
      sessionId: "session_1",
      clientId: "client_1",
      threadId: "thread_1",
    };

    await runTriggerAgent.run(payload, { ctx: {} as never });
    await runTriggerAgent.run(payload, { ctx: {} as never });

    expect(consumeAnthropicSession).toHaveBeenCalledTimes(2);
    expect(finalizeTriggerRun).toHaveBeenCalledTimes(2);
    expect(finalizeTriggerRun).toHaveBeenNthCalledWith(
      1,
      { __role: "service" },
      expect.objectContaining({
        runId: "run_1",
        threadId: "thread_1",
        clientId: "client_1",
        events: terminalEvents,
        cost: terminalCost,
      }),
    );
    expect(finalizeTriggerRun).toHaveBeenNthCalledWith(
      2,
      { __role: "service" },
      expect.objectContaining({
        runId: "run_1",
        threadId: "thread_1",
        clientId: "client_1",
        events: terminalEvents,
        cost: terminalCost,
      }),
    );
  });

  it("passes retries_exhausted terminal events through to finalizeTriggerRun", async () => {
    consumeAnthropicSession.mockImplementation(
      async (options: {
        onTerminal?: (events: unknown[], cost: unknown) => Promise<void>;
      }) => {
        await options.onTerminal?.(
          [
            {
              id: "evt_retry",
              type: "session.status_idle",
              stop_reason: { type: "retries_exhausted" },
            },
          ],
          {
            inputTokens: 50,
            outputTokens: 5,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            runtimeSeconds: 3,
          },
        );

        return {
          status: "failed",
          reason: "retries_exhausted",
          accumulatedEvents: [],
          cost: {
            inputTokens: 50,
            outputTokens: 5,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            runtimeSeconds: 3,
          },
          approvalEventIds: [],
        };
      },
    );

    await runTriggerAgent.run(
      {
        runId: "run_1",
        sessionId: "session_1",
        clientId: "client_1",
        threadId: "thread_1",
      },
      { ctx: {} as never },
    );

    expect(finalizeTriggerRun).toHaveBeenCalledWith(
      { __role: "service" },
      expect.objectContaining({
        runId: "run_1",
        threadId: "thread_1",
        clientId: "client_1",
        events: [
          expect.objectContaining({
            id: "evt_retry",
            type: "session.status_idle",
            stop_reason: { type: "retries_exhausted" },
          }),
        ],
        cost: expect.objectContaining({
          inputTokens: 50,
          outputTokens: 5,
          runtimeSeconds: 3,
        }),
      }),
    );
  });

  it("re-throws so Trigger.dev retries when the core errors", async () => {
    consumeAnthropicSession.mockRejectedValue(new Error("stream failed"));

    await expect(
      runTriggerAgent.run(
        {
          runId: "run_1",
          sessionId: "session_1",
          clientId: "client_1",
          threadId: "thread_1",
        },
        { ctx: {} as never },
      ),
    ).rejects.toThrow("stream failed");

    expect(finalizeTriggerRun).not.toHaveBeenCalled();
  });
});
