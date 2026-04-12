/**
 * Tests for `persistTurnInBackground` — the background worker that
 * subscribes to a session after a user.message, accumulates events, and
 * persists on terminal.
 *
 * @module lib/managed-agents/__tests__/persist-turn-in-background.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  openSessionStream,
  iterateSessionEvents,
  buildAssistantPartsFromEvents,
  getAssistantTextFromParts,
  upsertMessage,
  deliverToExternalChannels,
  createRun,
  completeRun,
  runEvaluatorsForEvents,
  computeTurnCost,
} = vi.hoisted(() => ({
  openSessionStream: vi.fn(),
  iterateSessionEvents: vi.fn(),
  buildAssistantPartsFromEvents: vi.fn(),
  getAssistantTextFromParts: vi.fn(),
  upsertMessage: vi.fn(),
  deliverToExternalChannels: vi.fn(),
  createRun: vi.fn(),
  completeRun: vi.fn(),
  runEvaluatorsForEvents: vi.fn(),
  computeTurnCost: vi.fn(),
}));

vi.mock("@/lib/managed-agents/session-reconnect", () => ({
  openSessionStream,
  iterateSessionEvents,
}));
vi.mock("@/lib/managed-agents/events-to-assistant-parts", () => ({
  buildAssistantPartsFromEvents,
}));
vi.mock("@/lib/runner/message-utils", () => ({
  getAssistantTextFromParts,
}));
vi.mock("@/lib/chat/messages", () => ({ upsertMessage }));
vi.mock("@/lib/channels/deliver", () => ({ deliverToExternalChannels }));
vi.mock("@/lib/runner/run-lifecycle", () => ({ createRun, completeRun }));
vi.mock("@/lib/eval/run-evaluators", () => ({ runEvaluatorsForEvents }));
vi.mock("@/lib/managed-agents/adapter-cost", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/managed-agents/adapter-cost")>();
  return {
    ...actual,
    computeTurnCost,
  };
});

import { persistTurnInBackground } from "../persist-turn-in-background";

import {
  agentMessageTextEvent,
  statusIdleEvent,
  modelRequestEndEvent,
} from "./fixtures/events";

function makeFakeSupabase() {
  return {} as never;
}

describe("persistTurnInBackground", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createRun.mockResolvedValue({ created: true, runId: "run_1" });
    completeRun.mockResolvedValue(undefined);
    upsertMessage.mockResolvedValue(undefined);
    deliverToExternalChannels.mockResolvedValue(undefined);
    runEvaluatorsForEvents.mockResolvedValue(undefined);
    computeTurnCost.mockReturnValue(0.001);
    buildAssistantPartsFromEvents.mockReturnValue([
      { type: "text", text: "hello" },
    ]);
    getAssistantTextFromParts.mockReturnValue("hello");
  });

  it("subscribes, accumulates events, and persists on end_turn", async () => {
    const events = [
      agentMessageTextEvent("evt_1", "hello"),
      modelRequestEndEvent("evt_usage", 100, 50),
      statusIdleEvent("evt_idle", "end_turn"),
    ];

    openSessionStream.mockResolvedValue({
      live: { [Symbol.asyncIterator]: async function* () {} },
      preKickoffEventIds: new Set(),
    });
    iterateSessionEvents.mockImplementation(async function* () {
      for (const e of events) yield e;
    });

    const promise = persistTurnInBackground({
      anthropic: {} as never,
      supabase: makeFakeSupabase(),
      clientId: "c1",
      threadId: "t1",
      sessionId: "sess_1",
      conversationInput: "hi",
    });

    await promise;

    expect(createRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ threadId: "t1", clientId: "c1" }),
    );
    expect(upsertMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        thread_id: "t1",
        role: "assistant",
      }),
    );
    expect(completeRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ runId: "run_1", status: "completed" }),
    );
    expect(runEvaluatorsForEvents).toHaveBeenCalled();
  });

  it("marks run failed when event iteration throws", async () => {
    openSessionStream.mockResolvedValue({
      live: { [Symbol.asyncIterator]: async function* () {} },
      preKickoffEventIds: new Set(),
    });
    iterateSessionEvents.mockImplementation(async function* () {
      throw new Error("stream exploded");
    });

    const promise = persistTurnInBackground({
      anthropic: {} as never,
      supabase: makeFakeSupabase(),
      clientId: "c1",
      threadId: "t1",
      sessionId: "sess_1",
      conversationInput: "hi",
    });

    await promise;

    expect(completeRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ runId: "run_1", status: "failed" }),
    );
  });

  it("skips persistence when no assistant content", async () => {
    buildAssistantPartsFromEvents.mockReturnValue([
      { type: "step-start" },
    ]);

    openSessionStream.mockResolvedValue({
      live: { [Symbol.asyncIterator]: async function* () {} },
      preKickoffEventIds: new Set(),
    });
    iterateSessionEvents.mockImplementation(async function* () {
      yield statusIdleEvent("evt_idle", "end_turn");
    });

    await persistTurnInBackground({
      anthropic: {} as never,
      supabase: makeFakeSupabase(),
      clientId: "c1",
      threadId: "t1",
      sessionId: "sess_1",
      conversationInput: "hi",
    });

    // upsertMessage should NOT have been called for assistant output
    expect(upsertMessage).not.toHaveBeenCalled();
    // But run should still complete
    expect(completeRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "completed" }),
    );
  });
});
