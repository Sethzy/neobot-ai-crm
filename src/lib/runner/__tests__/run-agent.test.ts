/**
 * Tests for the runner core loop orchestration.
 * @module lib/runner/__tests__/run-agent
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockStreamText,
  mockStepCountIs,
  mockGateway,
  mockAssembleContext,
  mockCreateRun,
  mockCompleteRun,
  mockMarkStaleRunsFailed,
  mockEnqueueMessage,
  mockDrainAndContinue,
  mockCreateCrmTools,
  mockCreateStorageTools,
} = vi.hoisted(() => ({
  mockStreamText: vi.fn(),
  mockStepCountIs: vi.fn(() => vi.fn(() => true)),
  mockGateway: vi.fn(() => "mock-model"),
  mockAssembleContext: vi.fn(),
  mockCreateRun: vi.fn(),
  mockCompleteRun: vi.fn(),
  mockMarkStaleRunsFailed: vi.fn(),
  mockEnqueueMessage: vi.fn(),
  mockDrainAndContinue: vi.fn(),
  mockCreateCrmTools: vi.fn(),
  mockCreateStorageTools: vi.fn(),
}));

vi.mock("ai", () => ({
  streamText: mockStreamText,
  stepCountIs: mockStepCountIs,
}));

vi.mock("@/lib/ai/gateway", () => ({
  gateway: mockGateway,
  TIER_1_MODEL: "google/gemini-3-flash",
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
  enqueueMessage: mockEnqueueMessage,
}));

vi.mock("@/lib/runner/drain-and-continue", () => ({
  drainAndContinue: mockDrainAndContinue,
}));
vi.mock("@/lib/runner/tools", () => ({
  createCrmTools: mockCreateCrmTools,
  createStorageTools: mockCreateStorageTools,
}));

import type { RunnerPayload } from "../schemas";
import { runAgent } from "../run-agent";

const validPayload: RunnerPayload = {
  clientId: "550e8400-e29b-41d4-a716-446655440000",
  threadId: "660e8400-e29b-41d4-a716-446655440000",
  triggerType: "chat",
  input: "Hello, Sunder!",
};

const originalEnableCrmWriteToolsEnv = process.env.RUNNER_ENABLE_CRM_WRITE_TOOLS;
const originalNodeEnv = process.env.NODE_ENV;
const originalVercelEnv = process.env.VERCEL_ENV;

describe("runAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "test";
    delete process.env.VERCEL_ENV;
    delete process.env.RUNNER_ENABLE_CRM_WRITE_TOOLS;
    mockMarkStaleRunsFailed.mockResolvedValue(0);
    mockCreateCrmTools.mockReturnValue({
      search_contacts: { description: "tool" },
    });
    mockCreateStorageTools.mockReturnValue({
      read_file: { description: "storage-tool" },
      write_file: { description: "storage-tool" },
    });
    mockAssembleContext.mockResolvedValue({
      system: "You are Sunder.",
      messages: [{ role: "user", content: "Hello, Sunder!" }],
    });
    mockStreamText.mockReturnValue({
      toUIMessageStreamResponse: vi.fn(() => new Response("streamed")),
    });
  });

  it("streams when lock is acquired", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    const result = await runAgent(validPayload, "mock-supabase-client" as never);

    expect(result.status).toBe("streaming");
    expect(mockGateway).toHaveBeenCalledWith("google/gemini-3-flash");
    expect(mockStepCountIs).toHaveBeenCalledWith(4);
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "mock-model",
        system: "You are Sunder.",
        messages: [{ role: "user", content: "Hello, Sunder!" }],
        stopWhen: expect.any(Function),
        tools: {
          search_contacts: { description: "tool" },
          read_file: { description: "storage-tool" },
          write_file: { description: "storage-tool" },
        },
      }),
    );
    expect(mockCreateCrmTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      { allowWriteTools: false },
    );
    expect(mockCreateStorageTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
    );
  });

  it("enables CRM write tools only when env flag is set", async () => {
    process.env.RUNNER_ENABLE_CRM_WRITE_TOOLS = "1";
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(validPayload, "mock-supabase-client" as never);

    expect(mockCreateCrmTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      { allowWriteTools: true },
    );
  });

  it("keeps CRM write tools disabled for non-1 env values", async () => {
    process.env.RUNNER_ENABLE_CRM_WRITE_TOOLS = "true";
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(validPayload, "mock-supabase-client" as never);

    expect(mockCreateCrmTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      { allowWriteTools: false },
    );
  });

  it("keeps CRM write tools disabled in production even when env flag is set", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.RUNNER_ENABLE_CRM_WRITE_TOOLS = "1";
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(validPayload, "mock-supabase-client" as never);

    expect(mockCreateCrmTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      { allowWriteTools: false },
    );
  });

  it("keeps CRM write tools disabled when NODE_ENV is production and VERCEL_ENV is unset", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.VERCEL_ENV;
    process.env.RUNNER_ENABLE_CRM_WRITE_TOOLS = "1";
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(validPayload, "mock-supabase-client" as never);

    expect(mockCreateCrmTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      { allowWriteTools: false },
    );
  });

  it("allows CRM write tools in preview deployments when env flag is set", async () => {
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "preview";
    process.env.RUNNER_ENABLE_CRM_WRITE_TOOLS = "1";
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(validPayload, "mock-supabase-client" as never);

    expect(mockCreateCrmTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      { allowWriteTools: true },
    );
  });

  it("enqueues and returns queued when thread is already running", async () => {
    mockCreateRun.mockResolvedValue({ created: false });

    const result = await runAgent(validPayload, "mock-supabase-client" as never);

    expect(result).toEqual({ status: "queued" });
    expect(mockEnqueueMessage).toHaveBeenCalledWith("mock-supabase-client", {
      threadId: validPayload.threadId,
      clientId: validPayload.clientId,
      content: validPayload.input,
      channel: "web",
    });
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it("passes assembled thread context to streamText", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });
    mockAssembleContext.mockResolvedValue({
      system: "Custom system prompt",
      messages: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello!" },
        { role: "user", content: "Hello, Sunder!" },
      ],
    });

    await runAgent(validPayload, "mock-supabase-client" as never);

    expect(mockAssembleContext).toHaveBeenCalledWith({
      supabase: "mock-supabase-client",
      threadId: validPayload.threadId,
      currentMessage: validPayload.input,
    });
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: "Custom system prompt",
        messages: [
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello!" },
          { role: "user", content: "Hello, Sunder!" },
        ],
      }),
    );
  });

  it("records failed run when streamText throws", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });
    mockStreamText.mockImplementation(() => {
      throw new Error("Model API error");
    });

    await expect(runAgent(validPayload, "mock-supabase-client" as never)).rejects.toThrow(
      "Model API error",
    );

    expect(mockCompleteRun).toHaveBeenCalledWith("mock-supabase-client", {
      runId: "run-1",
      status: "failed",
      model: "google/gemini-3-flash",
      tokensIn: 0,
      tokensOut: 0,
    });
  });

  it("completes run and attempts queue drain when onFinish executes", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(validPayload, "mock-supabase-client" as never);

    const streamCall = mockStreamText.mock.calls[0]?.[0];
    expect(typeof streamCall.onFinish).toBe("function");

    await streamCall.onFinish({
      totalUsage: {
        inputTokens: 100,
        inputTokenDetails: {
          noCacheTokens: undefined,
          cacheReadTokens: undefined,
          cacheWriteTokens: undefined,
        },
        outputTokens: 50,
        outputTokenDetails: {
          textTokens: undefined,
          reasoningTokens: undefined,
        },
        totalTokens: 150,
      },
    });

    expect(mockCompleteRun).toHaveBeenCalledWith("mock-supabase-client", {
      runId: "run-1",
      status: "completed",
      model: "google/gemini-3-flash",
      tokensIn: 100,
      tokensOut: 50,
    });
    expect(mockDrainAndContinue).toHaveBeenCalledWith("mock-supabase-client", {
      clientId: validPayload.clientId,
      threadId: validPayload.threadId,
    });
  });

  afterAll(() => {
    if (originalEnableCrmWriteToolsEnv === undefined) {
      delete process.env.RUNNER_ENABLE_CRM_WRITE_TOOLS;
    } else {
      process.env.RUNNER_ENABLE_CRM_WRITE_TOOLS = originalEnableCrmWriteToolsEnv;
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalVercelEnv === undefined) {
      delete process.env.VERCEL_ENV;
      return;
    }

    process.env.VERCEL_ENV = originalVercelEnv;
  });
});
