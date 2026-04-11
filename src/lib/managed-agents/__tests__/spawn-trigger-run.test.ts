/**
 * Tests for the trigger fire-path helper that creates disposable
 * Anthropic sessions and hands them off to the Trigger.dev listener.
 * @module lib/managed-agents/__tests__/spawn-trigger-run
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  sessionsCreate,
  eventsSend,
  runTriggerAgentTrigger,
  getServerEnv,
} = vi.hoisted(() => ({
  sessionsCreate: vi.fn(),
  eventsSend: vi.fn(),
  runTriggerAgentTrigger: vi.fn(),
  getServerEnv: vi.fn(),
}));

vi.mock("@/lib/managed-agents/anthropic-client", () => ({
  getAnthropicClient: () => ({
    beta: {
      sessions: {
        create: sessionsCreate,
        events: { send: eventsSend },
      },
    },
  }),
}));

vi.mock("@/trigger/run-trigger-agent", () => ({
  runTriggerAgent: { trigger: runTriggerAgentTrigger },
}));
vi.mock("@/lib/env", () => ({
  getServerEnv,
}));

import { spawnTriggerRun } from "../spawn-trigger-run";

function mockSupabase() {
  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { run_id: "run-1", session_id: "session_abc" },
            error: null,
          }),
        }),
      }),
    }),
  } as never;
}

describe("spawnTriggerRun", () => {
  beforeEach(() => {
    sessionsCreate.mockReset().mockResolvedValue({ id: "session_abc" });
    eventsSend.mockReset().mockResolvedValue(undefined);
    runTriggerAgentTrigger.mockReset().mockResolvedValue({ id: "trigger_handle_1" });
    getServerEnv.mockReturnValue({
      ANTHROPIC_AGENT_ID: "agent-1",
      ANTHROPIC_AGENT_VERSION: "2",
      ANTHROPIC_ENVIRONMENT_ID: "env-1",
    });
  });

  it("creates a session pinned to the configured agent version and inserts a runs row", async () => {
    const result = await spawnTriggerRun(mockSupabase(), {
      runId: "run-1",
      clientId: "client-1",
      threadId: "thread-1",
      triggerType: "cron",
      invocationMessage: "Hello, agent.",
    });

    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: { type: "agent", id: "agent-1", version: 2 },
        environment_id: "env-1",
      }),
    );
    expect(result).toMatchObject({
      runId: "run-1",
      sessionId: "session_abc",
      taskHandle: { id: "trigger_handle_1" },
    });
  });

  it("sends the kickoff user.message after the session is created", async () => {
    await spawnTriggerRun(mockSupabase(), {
      runId: "run-1",
      clientId: "client-1",
      threadId: "thread-1",
      triggerType: "cron",
      invocationMessage: "Hello, agent.",
    });

    expect(eventsSend).toHaveBeenCalledWith("session_abc", {
      events: [
        {
          type: "user.message",
          content: [{ type: "text", text: "Hello, agent." }],
        },
      ],
    });
  });

  it("spawns runTriggerAgent with the run metadata", async () => {
    const result = await spawnTriggerRun(mockSupabase(), {
      runId: "run-1",
      clientId: "client-1",
      threadId: "thread-1",
      triggerType: "cron",
      invocationMessage: "Hello, agent.",
    });

    expect(runTriggerAgentTrigger).toHaveBeenCalledWith({
      runId: "run-1",
      sessionId: "session_abc",
      clientId: "client-1",
      threadId: "thread-1",
    });
    expect(result.taskHandle).toEqual({ id: "trigger_handle_1" });
  });

  it("throws if the runs insert fails", async () => {
    const brokenSupabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "insert failed" },
            }),
          }),
        }),
      }),
    } as never;

    await expect(
      spawnTriggerRun(brokenSupabase, {
        runId: "run-1",
        clientId: "client-1",
        threadId: "thread-1",
        triggerType: "cron",
        invocationMessage: "Hello, agent.",
      }),
    ).rejects.toThrow(/insert failed/);
  });
});
