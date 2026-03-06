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
  mockCreateWebTools,
  mockCreateUtilityTools,
  mockCreateMessages,
  mockMaybeCompactThread,
  mockTruncateOversizedParts,
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
  mockCreateWebTools: vi.fn(),
  mockCreateUtilityTools: vi.fn(),
  mockCreateMessages: vi.fn(),
  mockMaybeCompactThread: vi.fn(),
  mockTruncateOversizedParts: vi.fn(),
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
  createWebTools: mockCreateWebTools,
  createUtilityTools: mockCreateUtilityTools,
}));

vi.mock("@/lib/chat/messages", () => ({
  createMessages: (...args: unknown[]) => mockCreateMessages(...args),
}));

vi.mock("@/lib/runner/compaction", () => ({
  CRM_COMPACTION_INSTRUCTIONS:
    "Preserve deal names, contact details, task statuses, and decisions made.",
  maybeCompactThread: (...args: unknown[]) => mockMaybeCompactThread(...args),
}));

vi.mock("@/lib/runner/toolcall-artifacts", () => ({
  truncateOversizedParts: (...args: unknown[]) => mockTruncateOversizedParts(...args),
}));

import type { RunnerPayload } from "../schemas";
import { buildPrepareStep, runAgent } from "../run-agent";

const validPayload: RunnerPayload = {
  clientId: "550e8400-e29b-41d4-a716-446655440000",
  threadId: "660e8400-e29b-41d4-a716-446655440000",
  triggerType: "chat",
  input: "Hello, Sunder!",
};

const originalNodeEnv = process.env.NODE_ENV;
const originalVercelEnv = process.env.VERCEL_ENV;

describe("runAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "test";
    delete process.env.VERCEL_ENV;
    mockMarkStaleRunsFailed.mockResolvedValue(0);
    mockCreateCrmTools.mockReturnValue({
      search_contacts: { description: "tool" },
      create_contact: { description: "tool" },
      update_contact: { description: "tool" },
      search_deals: { description: "tool" },
      create_deal: { description: "tool" },
      update_deal: { description: "tool" },
      search_tasks: { description: "tool" },
      create_task: { description: "tool" },
      update_task: { description: "tool" },
      create_interaction: { description: "tool" },
    });
    mockCreateStorageTools.mockReturnValue({
      read_file: { description: "storage-tool" },
      write_file: { description: "storage-tool" },
    });
    mockCreateWebTools.mockReturnValue({
      web_search: { description: "web-search-tool" },
      web_scrape: { description: "web-scrape-tool" },
    });
    mockCreateUtilityTools.mockReturnValue({
      manage_todo: { description: "utility-tool" },
      list_todo: { description: "utility-tool" },
      rename_chat: { description: "utility-tool" },
      run_agent_memory_sql: { description: "utility-tool" },
      get_agent_db_schema: { description: "utility-tool" },
    });
    mockAssembleContext.mockResolvedValue({
      system: "You are Sunder.",
      messages: [{ role: "user", content: "Hello, Sunder!" }],
    });
    mockTruncateOversizedParts.mockImplementation(async (_supabase, _clientId, parts) => ({
      parts,
      recoveryPaths: [],
    }));
    mockMaybeCompactThread.mockResolvedValue(false);
    mockStreamText.mockReturnValue({
      toUIMessageStreamResponse: vi.fn(() => new Response("streamed")),
    });
    mockCreateMessages.mockResolvedValue([]);
  });

  it("streams when lock is acquired", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    const result = await runAgent(validPayload, "mock-supabase-client" as never);

    expect(result.status).toBe("streaming");
    expect(mockGateway).toHaveBeenCalledWith("google/gemini-3-flash");
    expect(mockStepCountIs).toHaveBeenCalledWith(9);
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "mock-model",
        system: "You are Sunder.",
        messages: [{ role: "user", content: "Hello, Sunder!" }],
        stopWhen: expect.any(Function),
        tools: {
          search_contacts: { description: "tool" },
          create_contact: { description: "tool" },
          update_contact: { description: "tool" },
          search_deals: { description: "tool" },
          create_deal: { description: "tool" },
          update_deal: { description: "tool" },
          search_tasks: { description: "tool" },
          create_task: { description: "tool" },
          update_task: { description: "tool" },
          create_interaction: { description: "tool" },
          read_file: { description: "storage-tool" },
          write_file: { description: "storage-tool" },
          web_search: { description: "web-search-tool" },
          web_scrape: { description: "web-scrape-tool" },
          manage_todo: { description: "utility-tool" },
          list_todo: { description: "utility-tool" },
          rename_chat: { description: "utility-tool" },
          run_agent_memory_sql: { description: "utility-tool" },
          get_agent_db_schema: { description: "utility-tool" },
        },
      }),
    );
    expect(mockCreateCrmTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      { allowWriteTools: true },
    );
    expect(mockCreateStorageTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
    );
    expect(mockCreateWebTools).toHaveBeenCalledWith();
    expect(mockCreateUtilityTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      validPayload.threadId,
    );
  });

  it("always enables CRM write tools regardless of environment", async () => {
    process.env.VERCEL_ENV = "production";
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(validPayload, "mock-supabase-client" as never);

    expect(mockCreateCrmTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      { allowWriteTools: true },
    );
  });

  it("does not enable model thought-streaming by default", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(validPayload, "mock-supabase-client" as never);

    const streamCall = mockStreamText.mock.calls[0]?.[0];
    expect(streamCall.providerOptions).toBeUndefined();
  });

  it("buildPrepareStep no longer injects Anthropic-native compaction edits", () => {
    const prepareStep = buildPrepareStep("anthropic/claude-sonnet-4-6");
    expect(prepareStep({ stepNumber: 0 } as never)).toBeUndefined();
    expect(prepareStep({ stepNumber: 8 } as never)).toEqual({ activeTools: [] });
  });

  it("buildPrepareStep keeps the Gemini path unchanged except for the final-step tool cutoff", () => {
    const prepareStep = buildPrepareStep("google/gemini-3-flash");

    expect(prepareStep({ stepNumber: 0 } as never)).toBeUndefined();
    expect(prepareStep({ stepNumber: 8 } as never)).toEqual({ activeTools: [] });
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
      currentMessage: "",
      clientId: validPayload.clientId,
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

  it("persists the inbound user input to conversation_messages before streaming", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(validPayload, "mock-supabase-client" as never);

    expect(mockCreateMessages).toHaveBeenCalledWith("mock-supabase-client", [
      {
        thread_id: validPayload.threadId,
        role: "user",
        content: validPayload.input,
        parts: [{ type: "text", text: validPayload.input }],
      },
    ]);
    expect(mockAssembleContext).toHaveBeenCalledWith({
      supabase: "mock-supabase-client",
      threadId: validPayload.threadId,
      currentMessage: "",
      clientId: validPayload.clientId,
    });
  });

  it("persists assistant output text to conversation_messages when stream finishes", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(validPayload, "mock-supabase-client" as never);

    const streamCall = mockStreamText.mock.calls[0]?.[0];
    expect(typeof streamCall.onFinish).toBe("function");

    await streamCall.onFinish({
      text: "Assistant response",
      steps: [],
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

    expect(mockCreateMessages).toHaveBeenNthCalledWith(2, "mock-supabase-client", [
      {
        thread_id: validPayload.threadId,
        role: "assistant",
        content: "Assistant response",
        parts: [{ type: "text", text: "Assistant response" }],
      },
    ]);
  });

  it("does not persist an extra user message for cron trigger runs", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(
      {
        ...validPayload,
        triggerType: "cron",
        input: "Process the most recent trigger event for this thread.",
      },
      "mock-supabase-client" as never,
    );

    expect(mockCreateMessages).not.toHaveBeenCalled();
  });

  it("persists assistant tool parts in AI SDK v6 format when stream finishes", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(validPayload, "mock-supabase-client" as never);

    const streamCall = mockStreamText.mock.calls[0]?.[0];
    expect(typeof streamCall.onFinish).toBe("function");

    await streamCall.onFinish({
      text: "I found the contacts.",
      steps: [
        {
          content: [
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "search_contacts",
              input: { query: "John" },
            },
            {
              type: "tool-result",
              toolCallId: "call-1",
              toolName: "search_contacts",
              input: { query: "John" },
              output: { success: true, contacts: [] },
            },
            {
              type: "text",
              text: "I found the contacts.",
            },
          ],
          toolCalls: [
            {
              toolCallId: "call-1",
              toolName: "search_contacts",
              input: { query: "John" },
            },
          ],
          toolResults: [
            {
              toolCallId: "call-1",
              toolName: "search_contacts",
              input: { query: "John" },
              output: { success: true, contacts: [] },
            },
          ],
          text: "I found the contacts.",
        },
      ],
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

    expect(mockCreateMessages).toHaveBeenNthCalledWith(2, "mock-supabase-client", [
      {
        thread_id: validPayload.threadId,
        role: "assistant",
        content: "I found the contacts.",
        parts: [
          { type: "step-start" },
          {
            type: "tool-search_contacts",
            toolCallId: "call-1",
            state: "output-available",
            input: { query: "John" },
            output: { success: true, contacts: [] },
          },
          { type: "text", text: "I found the contacts." },
        ],
      },
    ]);
  });

  it("truncates oversized tool outputs before persistence and appends a recovery note to content", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });
    mockTruncateOversizedParts.mockResolvedValue({
      parts: [
        { type: "step-start" },
        {
          type: "tool-search_contacts",
          toolCallId: "call-1",
          state: "output-available",
          output:
            '<context-removed path="toolcalls/call-1/result.json" reason="Result exceeded size threshold (6200 bytes). Use read_file to recover the full content." />',
        },
        { type: "text", text: "I found the contacts." },
      ],
      recoveryPaths: ["toolcalls/call-1/result.json"],
    });

    await runAgent(validPayload, "mock-supabase-client" as never);

    const streamCall = mockStreamText.mock.calls[0]?.[0];
    await streamCall.onFinish({
      text: "I found the contacts.",
      steps: [
        {
          content: [
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "search_contacts",
              input: { query: "John" },
            },
            {
              type: "tool-result",
              toolCallId: "call-1",
              toolName: "search_contacts",
              input: { query: "John" },
              output: { blob: "x".repeat(6_000) },
            },
            { type: "text", text: "I found the contacts." },
          ],
          toolCalls: [],
          toolResults: [],
          text: "I found the contacts.",
        },
      ],
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

    expect(mockTruncateOversizedParts).toHaveBeenCalled();
    expect(mockCreateMessages).toHaveBeenNthCalledWith(2, "mock-supabase-client", [
      expect.objectContaining({
        thread_id: validPayload.threadId,
        role: "assistant",
        content: expect.stringContaining("I found the contacts."),
        parts: [
          { type: "step-start" },
          {
            type: "tool-search_contacts",
            toolCallId: "call-1",
            state: "output-available",
            output:
              '<context-removed path="toolcalls/call-1/result.json" reason="Result exceeded size threshold (6200 bytes). Use read_file to recover the full content." />',
          },
          { type: "text", text: "I found the contacts." },
        ],
      }),
    ]);
    expect(mockCreateMessages.mock.calls[1]?.[1]?.[0]?.content).toContain(
      "toolcalls/call-1/result.json",
    );
  });

  it("falls back to raw parts when toolcall artifact persistence fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });
    mockTruncateOversizedParts.mockRejectedValue(new Error("upload failed"));

    await runAgent(validPayload, "mock-supabase-client" as never);

    const streamCall = mockStreamText.mock.calls[0]?.[0];
    await streamCall.onFinish({
      text: "I found the contacts.",
      steps: [
        {
          content: [
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "search_contacts",
              input: { query: "John" },
            },
            {
              type: "tool-result",
              toolCallId: "call-1",
              toolName: "search_contacts",
              input: { query: "John" },
              output: { blob: "x".repeat(6_000) },
            },
            { type: "text", text: "I found the contacts." },
          ],
          toolCalls: [],
          toolResults: [],
          text: "I found the contacts.",
        },
      ],
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

    expect(mockCreateMessages).toHaveBeenNthCalledWith(2, "mock-supabase-client", [
      {
        thread_id: validPayload.threadId,
        role: "assistant",
        content: "I found the contacts.",
        parts: [
          { type: "step-start" },
          {
            type: "tool-search_contacts",
            toolCallId: "call-1",
            state: "output-available",
            input: { query: "John" },
            output: { blob: "x".repeat(6_000) },
          },
          { type: "text", text: "I found the contacts." },
        ],
      },
    ]);
    expect(mockCompleteRun).toHaveBeenCalledWith("mock-supabase-client", {
      runId: "run-1",
      status: "completed",
      model: "google/gemini-3-flash",
      tokensIn: 100,
      tokensOut: 50,
      stepCount: 1,
    });
    expect(mockDrainAndContinue).toHaveBeenCalledWith("mock-supabase-client", {
      clientId: validPayload.clientId,
      threadId: validPayload.threadId,
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[runner] toolcall artifact persistence failed:",
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
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
      steps: [],
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
      stepCount: 0,
    });
    expect(mockDrainAndContinue).toHaveBeenCalledWith("mock-supabase-client", {
      clientId: validPayload.clientId,
      threadId: validPayload.threadId,
    });
    expect(mockMaybeCompactThread).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      validPayload.threadId,
    );
  });

  it("passes step count from onFinish steps to completeRun", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(validPayload, "mock-supabase-client" as never);

    const streamCall = mockStreamText.mock.calls[0]?.[0];
    expect(typeof streamCall.onFinish).toBe("function");

    await streamCall.onFinish({
      steps: [
        { toolCalls: [], toolResults: [] },
        {
          toolCalls: [{ toolCallId: "call-1", toolName: "search_contacts", input: {} }],
          toolResults: [],
        },
        { toolCalls: [], toolResults: [] },
      ],
      totalUsage: {
        inputTokens: 200,
        inputTokenDetails: {
          noCacheTokens: undefined,
          cacheReadTokens: undefined,
          cacheWriteTokens: undefined,
        },
        outputTokens: 100,
        outputTokenDetails: {
          textTokens: undefined,
          reasoningTokens: undefined,
        },
        totalTokens: 300,
      },
    });

    expect(mockCompleteRun).toHaveBeenCalledWith("mock-supabase-client", {
      runId: "run-1",
      status: "completed",
      model: "google/gemini-3-flash",
      tokensIn: 200,
      tokensOut: 100,
      stepCount: 3,
    });
  });

  it("logs and swallows post-run compaction failures", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });
    mockMaybeCompactThread.mockRejectedValueOnce(new Error("compaction failed"));

    await runAgent(validPayload, "mock-supabase-client" as never);

    const streamCall = mockStreamText.mock.calls[0]?.[0];

    await expect(
      streamCall.onFinish({
        text: "Assistant response",
        steps: [],
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
      }),
    ).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[runner] post-run compaction failed:",
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });

  afterAll(() => {
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
