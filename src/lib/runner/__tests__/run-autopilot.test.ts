/**
 * Tests for the autopilot wrapper around runAgent.
 * @module lib/runner/__tests__/run-autopilot
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunAgent } = vi.hoisted(() => ({
  mockRunAgent: vi.fn(),
}));

vi.mock("@/lib/runner/run-agent", () => ({
  runAgent: mockRunAgent,
}));

import { AUTOPILOT_INSTRUCTION_PROMPT } from "@/lib/autopilot/constants";
import { runAutopilot } from "../run-autopilot";

describe("runAutopilot", () => {
  const clientId = "550e8400-e29b-41d4-a716-446655440000";
  const threadId = "660e8400-e29b-41d4-a716-446655440000";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls runAgent with pulse parameters and consumes the stream on success", async () => {
    const mockConsumeStream = vi.fn().mockResolvedValue(undefined);
    mockRunAgent.mockResolvedValue({
      status: "streaming",
      streamResult: { consumeStream: mockConsumeStream },
    });

    const result = await runAutopilot({
      clientId,
      threadId,
      supabase: "supabase" as never,
    });

    expect(result).toEqual({ status: "completed" });
    expect(mockRunAgent).toHaveBeenCalledWith(
      {
        clientId,
        threadId,
        input: "",
        triggerType: "pulse",
        channel: "web",
        consumeMessageQuota: false,
        instructions: AUTOPILOT_INSTRUCTION_PROMPT,
      },
      "supabase",
    );
    expect(mockConsumeStream).toHaveBeenCalledOnce();
  });

  it("maps queued status to skipped_busy", async () => {
    mockRunAgent.mockResolvedValue({ status: "queued" });

    const result = await runAutopilot({
      clientId,
      threadId,
      supabase: "supabase" as never,
    });

    expect(result).toEqual({ status: "skipped_busy" });
  });

  it("catches runAgent throws and returns failed status", async () => {
    mockRunAgent.mockRejectedValue(new Error("LLM timeout"));

    const result = await runAutopilot({
      clientId,
      threadId,
      supabase: "supabase" as never,
    });

    expect(result).toEqual({ status: "failed", error: "LLM timeout" });
  });

  it("handles non-Error throws with a generic message", async () => {
    mockRunAgent.mockRejectedValue("raw string error");

    const result = await runAutopilot({
      clientId,
      threadId,
      supabase: "supabase" as never,
    });

    expect(result).toEqual({ status: "failed", error: "Unknown autopilot error" });
  });

  it("never throws — all errors are returned as failed status", async () => {
    mockRunAgent.mockRejectedValue(new Error("catastrophic"));

    // This must not throw
    const result = await runAutopilot({
      clientId,
      threadId,
      supabase: "supabase" as never,
    });

    expect(result.status).toBe("failed");
  });

  it("detects stream errors via consumeStream onError and returns failed", async () => {
    const streamError = new Error("finalizeRun failed");
    const mockConsumeStream = vi.fn().mockImplementation(
      (options?: { onError?: (error: unknown) => void }) => {
        // Simulate: flush() caught onFinish error, called controller.error(),
        // stream errored, consumeStream caught the read error and calls onError
        options?.onError?.(streamError);
        return Promise.resolve();
      },
    );
    mockRunAgent.mockResolvedValue({
      status: "streaming",
      streamResult: { consumeStream: mockConsumeStream },
    });

    const result = await runAutopilot({
      clientId,
      threadId,
      supabase: "supabase" as never,
    });

    expect(result).toEqual({ status: "failed", error: "finalizeRun failed" });
  });

  it("detects non-Error stream failures via consumeStream onError", async () => {
    const mockConsumeStream = vi.fn().mockImplementation(
      (options?: { onError?: (error: unknown) => void }) => {
        options?.onError?.("raw error string");
        return Promise.resolve();
      },
    );
    mockRunAgent.mockResolvedValue({
      status: "streaming",
      streamResult: { consumeStream: mockConsumeStream },
    });

    const result = await runAutopilot({
      clientId,
      threadId,
      supabase: "supabase" as never,
    });

    expect(result).toEqual({ status: "failed", error: "Stream consumption failed" });
  });
});
