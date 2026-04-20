/**
 * Tests for the trigger fire-path helper that creates disposable
 * Anthropic sessions and hands them off to the Trigger.dev listener.
 * @module lib/managed-agents/__tests__/spawn-trigger-run
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  sessionsCreate,
  sessionsArchive,
  eventsSend,
  runTriggerAgentTrigger,
  getServerEnv,
  createThread,
} = vi.hoisted(() => ({
  sessionsCreate: vi.fn(),
  sessionsArchive: vi.fn(),
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
        archive: sessionsArchive,
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

import {
  AutomationAlreadyRunningError,
  spawnTriggerRun,
} from "../spawn-trigger-run";

const RUN_THREAD_ID = "run-thread-1";

function createThenableResult<T>(result: T) {
  return {
    then: (
      onFulfilled?: ((value: T) => unknown) | null,
      onRejected?: ((reason: unknown) => unknown) | null,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
}

function mockSupabase() {
  const updateEq = vi.fn().mockImplementation(() => createThenableResult({ error: null }));
  const updateFn = vi.fn().mockReturnValue({ eq: updateEq });
  const deleteEq = vi.fn().mockImplementation(() => createThenableResult({ error: null }));
  const deleteFn = vi.fn().mockReturnValue({ eq: deleteEq });
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
        return { update: updateFn, delete: deleteFn };
      }

      if (table === "runs") {
        return { insert: insertFn, delete: deleteFn };
      }

      throw new Error(`Unexpected table access: ${table}`);
    }),
    _update: updateFn,
    _updateEq: updateEq,
    _delete: deleteFn,
    _deleteEq: deleteEq,
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
    sessionsArchive.mockReset().mockResolvedValue(undefined);
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
    const deleteEq = vi.fn().mockImplementation(() => createThenableResult({ error: null }));
    const deleteFn = vi.fn().mockReturnValue({ eq: deleteEq });
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
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation(() => createThenableResult({ error: null })),
            }),
            delete: deleteFn,
          };
        }

        if (table === "runs") {
          return { insert: vi.fn().mockReturnValue(insertChain), delete: deleteFn };
        }

        throw new Error(`Unexpected table access: ${table}`);
      }),
    } as never;

    await expect(
      spawnTriggerRun(brokenSupabase, BASE_INPUT),
    ).rejects.toThrow(/insert failed/);

    expect(sessionsArchive).toHaveBeenCalledWith("session_abc");
    expect(deleteFn).toHaveBeenCalled();
  });

  it("throws AutomationAlreadyRunningError when the running-run index rejects a second run", async () => {
    const deleteEq = vi.fn().mockImplementation(() => createThenableResult({ error: null }));
    const deleteFn = vi.fn().mockReturnValue({ eq: deleteEq });
    const duplicateInsertChain = {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: "23505",
            message:
              'duplicate key value violates unique constraint "idx_runs_one_running_automation_per_trigger"',
          },
        }),
      }),
    };

    const brokenSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "conversation_threads") {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation(() => createThenableResult({ error: null })),
            }),
            delete: deleteFn,
          };
        }

        if (table === "runs") {
          return { insert: vi.fn().mockReturnValue(duplicateInsertChain), delete: deleteFn };
        }

        throw new Error(`Unexpected table access: ${table}`);
      }),
    } as never;

    await expect(
      spawnTriggerRun(brokenSupabase, BASE_INPUT),
    ).rejects.toBeInstanceOf(AutomationAlreadyRunningError);

    expect(sessionsArchive).toHaveBeenCalledWith("session_abc");
    expect(deleteFn).toHaveBeenCalled();
  });

  it("preserves AutomationAlreadyRunningError when cleanup deletes reject", async () => {
    const deleteEq = vi.fn().mockRejectedValue(new Error("cleanup delete rejected"));
    const deleteFn = vi.fn().mockReturnValue({ eq: deleteEq });
    const duplicateInsertChain = {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: "23505",
            message:
              'duplicate key value violates unique constraint "idx_runs_one_running_automation_per_trigger"',
          },
        }),
      }),
    };

    const brokenSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "conversation_threads") {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation(() => createThenableResult({ error: null })),
            }),
            delete: deleteFn,
          };
        }

        if (table === "runs") {
          return { insert: vi.fn().mockReturnValue(duplicateInsertChain), delete: deleteFn };
        }

        throw new Error(`Unexpected table access: ${table}`);
      }),
    } as never;

    await expect(
      spawnTriggerRun(brokenSupabase, BASE_INPUT),
    ).rejects.toBeInstanceOf(AutomationAlreadyRunningError);

    expect(sessionsArchive).toHaveBeenCalledWith("session_abc");
    expect(deleteEq).toHaveBeenCalledTimes(2);
  });

  it("archives the session and deletes partial DB artifacts when kickoff send fails", async () => {
    const sb = mockSupabase();
    eventsSend.mockRejectedValueOnce(new Error("kickoff failed"));

    await expect(
      spawnTriggerRun(sb, BASE_INPUT),
    ).rejects.toThrow(/kickoff failed/);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deleteFn = (sb as any)._delete;
    expect(sessionsArchive).toHaveBeenCalledWith("session_abc");
    expect(deleteFn).toHaveBeenCalled();
  });

  it("archives the session and deletes partial DB artifacts when listener trigger creation fails", async () => {
    const sb = mockSupabase();
    runTriggerAgentTrigger.mockRejectedValueOnce(new Error("listener queue failed"));

    await expect(
      spawnTriggerRun(sb, BASE_INPUT),
    ).rejects.toThrow(/listener queue failed/);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deleteFn = (sb as any)._delete;
    expect(sessionsArchive).toHaveBeenCalledWith("session_abc");
    expect(deleteFn).toHaveBeenCalled();
  });
});
