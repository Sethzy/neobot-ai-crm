/**
 * Runner-level resilience tests for tool-error completion paths.
 * @module lib/runner/__tests__/run-agent-tool-error-path
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockStreamText,
  mockStepCountIs,
  mockGateway,
  mockAssembleContext,
  mockCreateMessages,
  mockCreateRun,
  mockCompleteRun,
  mockMarkStaleRunsFailed,
  mockDrainAndContinue,
  mockCreateCrmTools,
  mockCreateStorageTools,
  mockCreateWebTools,
} = vi.hoisted(() => ({
  mockStreamText: vi.fn(),
  mockStepCountIs: vi.fn(() => vi.fn(() => true)),
  mockGateway: vi.fn(() => "mock-model"),
  mockAssembleContext: vi.fn(),
  mockCreateMessages: vi.fn(),
  mockCreateRun: vi.fn(),
  mockCompleteRun: vi.fn(),
  mockMarkStaleRunsFailed: vi.fn(),
  mockDrainAndContinue: vi.fn(),
  mockCreateCrmTools: vi.fn(),
  mockCreateStorageTools: vi.fn(),
  mockCreateWebTools: vi.fn(),
}));

vi.mock("ai", () => ({
  streamText: mockStreamText,
  stepCountIs: mockStepCountIs,
}));

vi.mock("@/lib/ai/gateway", () => ({
  gateway: mockGateway,
  TIER_1_MODEL: "google/gemini-3-flash",
}));

vi.mock("@/lib/chat/messages", () => ({
  createMessages: mockCreateMessages,
}));

vi.mock("@/lib/runner/context", () => ({
  assembleContext: mockAssembleContext,
}));

vi.mock("@/lib/runner/run-lifecycle", () => ({
  createRun: mockCreateRun,
  completeRun: mockCompleteRun,
  markStaleRunsFailed: mockMarkStaleRunsFailed,
}));

vi.mock("@/lib/runner/thread-queue", () => ({
  enqueueMessage: vi.fn(),
}));

vi.mock("@/lib/runner/drain-and-continue", () => ({
  drainAndContinue: mockDrainAndContinue,
}));

vi.mock("@/lib/runner/tools", () => ({
  createCrmTools: mockCreateCrmTools,
  createStorageTools: mockCreateStorageTools,
  createWebTools: mockCreateWebTools,
}));

import type { RunnerPayload } from "../schemas";
import { runAgent } from "../run-agent";

const validPayload: RunnerPayload = {
  clientId: "550e8400-e29b-41d4-a716-446655440000",
  threadId: "660e8400-e29b-41d4-a716-446655440000",
  triggerType: "chat",
  input: "Please use failing_tool",
};

describe("runAgent tool-error completion path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });
    mockMarkStaleRunsFailed.mockResolvedValue(0);
    mockCreateMessages.mockResolvedValue({ data: [], error: null });
    mockAssembleContext.mockResolvedValue({
      system: "You are Sunder.",
      messages: [{ role: "user", content: "Please use failing_tool" }],
    });
    mockCreateCrmTools.mockReturnValue({});
    mockCreateStorageTools.mockReturnValue({});
    mockCreateWebTools.mockReturnValue({});
    mockStreamText.mockReturnValue({
      toUIMessageStreamResponse: vi.fn(() => new Response("streamed")),
    });
  });

  it("completes and drains when onFinish contains tool-error result", async () => {
    await runAgent(validPayload, "mock-supabase-client" as never);

    const streamCall = mockStreamText.mock.calls[0]?.[0];
    expect(typeof streamCall.onFinish).toBe("function");

    await streamCall.onFinish({
      steps: [
        {
          toolCalls: [
            {
              toolCallId: "call-1",
              toolName: "failing_tool",
              input: {},
            },
          ],
          toolResults: [
            {
              toolCallId: "call-1",
              toolName: "failing_tool",
              output: { type: "tool-error", error: "Supabase timeout" },
            },
          ],
        },
      ],
      totalUsage: {
        inputTokens: 42,
        inputTokenDetails: {
          noCacheTokens: undefined,
          cacheReadTokens: undefined,
          cacheWriteTokens: undefined,
        },
        outputTokens: 7,
        outputTokenDetails: {
          textTokens: undefined,
          reasoningTokens: undefined,
        },
        totalTokens: 49,
      },
    } as never);

    expect(mockCompleteRun).toHaveBeenCalledWith("mock-supabase-client", {
      runId: "run-1",
      status: "completed",
      model: "google/gemini-3-flash",
      tokensIn: 42,
      tokensOut: 7,
      stepCount: 1,
    });
    expect(mockDrainAndContinue).toHaveBeenCalledWith("mock-supabase-client", {
      clientId: validPayload.clientId,
      threadId: validPayload.threadId,
    });
  });
});
