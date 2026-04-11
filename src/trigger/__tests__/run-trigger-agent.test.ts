/**
 * Tests for the per-trigger Managed Agents listener task.
 * @module src/trigger/__tests__/run-trigger-agent
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  consumeAnthropicSession,
  finalizeTriggerRun,
  createAdminClient,
  getAnthropicClient,
} = vi.hoisted(() => ({
  consumeAnthropicSession: vi.fn(),
  finalizeTriggerRun: vi.fn(),
  createAdminClient: vi.fn().mockResolvedValue({ __role: "service" }),
  getAnthropicClient: vi.fn().mockReturnValue({ __anthropic: true }),
}));

vi.mock("@/lib/managed-agents/session-runner", () => ({
  consumeAnthropicSession,
}));
vi.mock("@/lib/managed-agents/finalize-trigger-run", () => ({
  finalizeTriggerRun,
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
        onTerminal: expect.any(Function),
      }),
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
