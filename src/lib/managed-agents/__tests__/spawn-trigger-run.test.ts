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
  createThread,
} = vi.hoisted(() => ({
  sessionsCreate: vi.fn(),
  eventsSend: vi.fn(),
  runTriggerAgentTrigger: vi.fn(),
  getServerEnv: vi.fn(),
  createThread: vi.fn(),
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
vi.mock("@/lib/managed-agents/agent-config", () => ({
  resolveAgentRef: () => ({
    agentId: "agent-1",
    agentVersion: 2,
    anthropicModelId: "claude-sonnet-4-6",
  }),
}));
vi.mock("@/lib/chat/threads", () => ({
  createThread,
}));

import { spawnTriggerRun } from "../spawn-trigger-run";

const RUN_THREAD_ID = "run-thread-1";

function mockSupabase() {
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const updateFn = vi.fn().mockReturnValue({ eq: updateEq });
  const insertChain = {
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { run_id: "run-1", session_id: "session_abc" },
        error: null,
      }),
    }),
  };
  const insertFn = vi.fn().mockReturnValue(insertChain);

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "conversation_threads") {
        return { update: updateFn };
      }
      return { insert: insertFn };
    }),
    _update: updateFn,
    _updateEq: updateEq,
    _insert: insertFn,
  } as never;
}

const BASE_INPUT = {
  runId: "run-1",
  clientId: "client-1",
  threadId: "thread-1",
  triggerType: "cron" as const,
  invocationMessage: "Hello, agent.",
  triggerId: "trigger-1",
  triggerName: "Morning Briefing",
};

describe("spawnTriggerRun", () => {
  beforeEach(() => {
    sessionsCreate.mockReset().mockResolvedValue({ id: "session_abc" });
    eventsSend.mockReset().mockResolvedValue(undefined);
    runTriggerAgentTrigger.mockReset().mockResolvedValue({ id: "trigger_handle_1" });
    getServerEnv.mockReturnValue({
      ANTHROPIC_ENVIRONMENT_ID: "env-1",
    });
    createThread.mockReset().mockResolvedValue({ thread_id: RUN_THREAD_ID });
  });

  it("creates a dedicated run thread before the Anthropic session", async () => {
    await spawnTriggerRun(mockSupabase(), BASE_INPUT);

    expect(createThread).toHaveBeenCalledWith(
      expect.anything(),
      "client-1",
      expect.stringContaining("Morning Briefing"),
    );
  });

  it("marks the run thread with automation source columns", async () => {
    const sb = mockSupabase();
    await spawnTriggerRun(sb, BASE_INPUT);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateFn = (sb as any)._update;
    expect(updateFn).toHaveBeenCalledWith({
      source_type: "automation_run",
      source_trigger_id: "trigger-1",
      source_run_id: "run-1",
    });
  });

  it("creates a session pinned to the configured agent version and inserts a runs row", async () => {
    const result = await spawnTriggerRun(mockSupabase(), BASE_INPUT);

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
    await spawnTriggerRun(mockSupabase(), BASE_INPUT);

    expect(eventsSend).toHaveBeenCalledWith("session_abc", {
      events: [
        {
          type: "user.message",
          content: [{ type: "text", text: "Hello, agent." }],
        },
      ],
    });
  });

  it("spawns runTriggerAgent with the run thread ID", async () => {
    const result = await spawnTriggerRun(mockSupabase(), BASE_INPUT);

    expect(runTriggerAgentTrigger).toHaveBeenCalledWith({
      runId: "run-1",
      sessionId: "session_abc",
      clientId: "client-1",
      threadId: RUN_THREAD_ID,
    });
    expect(result.taskHandle).toEqual({ id: "trigger_handle_1" });
  });

  it("throws if the runs insert fails", async () => {
    const insertChain = {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "insert failed" },
        }),
      }),
    };

    const brokenSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "conversation_threads") {
          return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
        }
        return { insert: vi.fn().mockReturnValue(insertChain) };
      }),
    } as never;

    await expect(
      spawnTriggerRun(brokenSupabase, BASE_INPUT),
    ).rejects.toThrow(/insert failed/);
  });
});
