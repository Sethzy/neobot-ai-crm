/**
 * Tests queue drain + follow-up run behavior.
 * @module lib/runner/__tests__/drain-and-continue
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDrainQueue, mockRunAgent } = vi.hoisted(() => ({
  mockDrainQueue: vi.fn(),
  mockRunAgent: vi.fn(),
}));

vi.mock("@/lib/runner/thread-queue", () => ({
  drainQueue: mockDrainQueue,
}));

vi.mock("@/lib/runner/run-agent", () => ({
  runAgent: mockRunAgent,
}));

import { drainAndContinue } from "../drain-and-continue";

const CLIENT = "ccc00000-0000-0000-0000-000000000000";
const THREAD = "ttt00000-0000-0000-0000-000000000000";

describe("drainAndContinue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when no queued messages exist", async () => {
    mockDrainQueue.mockResolvedValue([]);

    await drainAndContinue("supabase" as never, { clientId: CLIENT, threadId: THREAD });

    expect(mockDrainQueue).toHaveBeenCalledWith("supabase", {
      threadId: THREAD,
      clientId: CLIENT,
    });
    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it("starts follow-up run with single drained message", async () => {
    mockDrainQueue.mockResolvedValue(["Only message"]);
    mockRunAgent.mockResolvedValue({ status: "streaming" });

    await drainAndContinue("supabase" as never, { clientId: CLIENT, threadId: THREAD });

    expect(mockRunAgent).toHaveBeenCalledWith(
      {
        clientId: CLIENT,
        threadId: THREAD,
        triggerType: "chat",
        input: "Only message",
      },
      "supabase",
    );
  });

  it("batches multiple drained messages into one follow-up run input", async () => {
    mockDrainQueue.mockResolvedValue(["First question", "Second question"]);
    mockRunAgent.mockResolvedValue({ status: "streaming" });

    await drainAndContinue("supabase" as never, { clientId: CLIENT, threadId: THREAD });

    expect(mockRunAgent).toHaveBeenCalledWith(
      {
        clientId: CLIENT,
        threadId: THREAD,
        triggerType: "chat",
        input: "Messages received while processing:\n1. First question\n2. Second question",
      },
      "supabase",
    );
  });

  it("does not throw when follow-up run result is queued", async () => {
    mockDrainQueue.mockResolvedValue(["Follow up"]);
    mockRunAgent.mockResolvedValue({ status: "queued" });

    await expect(
      drainAndContinue("supabase" as never, { clientId: CLIENT, threadId: THREAD }),
    ).resolves.not.toThrow();
  });
});
