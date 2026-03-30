/**
 * Runner-level resilience tests for tool-error completion paths.
 * @module lib/runner/__tests__/run-agent-tool-error-path
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockStreamText,
  mockStepCountIs,
  mockGateway,
  mockGetLanguageModel,
  mockLoadCrmConfig,
  mockAssembleContext,
  mockLoadSystemPromptState,
  mockCreateRun,
  mockCompleteRun,
  mockMarkStaleRunsFailed,
  mockDrainAndContinue,
  mockCreateCrmTools,
  mockCreateConnectionTools,
  mockCreateMarketTools,
  mockCreateStorageTools,
  mockCreateWebTools,
  mockCreateUtilityTools,
  mockCreateTriggerTools,
  mockCreateSubagentTool,
  mockCreateMessages,
  mockMaybeCompactThread,
  mockGetActiveConnections,
  mockIsPropertySupabaseConfigured,
  mockLoadActivatedConnectionTools,
  mockGetServerEnv,
} = vi.hoisted(() => ({
  mockStreamText: vi.fn(),
  mockStepCountIs: vi.fn(() => vi.fn(() => true)),
  mockGateway: vi.fn(() => "mock-model"),
  mockGetLanguageModel: vi.fn((modelId: string) => `language-model:${modelId}`),
  mockLoadCrmConfig: vi.fn(),
  mockAssembleContext: vi.fn(),
  mockLoadSystemPromptState: vi.fn().mockResolvedValue({
    userSkills: [],
    compactionState: null,
  }),
  mockCreateRun: vi.fn(),
  mockCompleteRun: vi.fn(),
  mockMarkStaleRunsFailed: vi.fn(),
  mockDrainAndContinue: vi.fn(),
  mockCreateCrmTools: vi.fn(),
  mockCreateConnectionTools: vi.fn(),
  mockCreateMarketTools: vi.fn(),
  mockCreateStorageTools: vi.fn(),
  mockCreateWebTools: vi.fn(),
  mockCreateUtilityTools: vi.fn(),
  mockCreateTriggerTools: vi.fn(),
  mockCreateSubagentTool: vi.fn(),
  mockCreateMessages: vi.fn(),
  mockMaybeCompactThread: vi.fn(),
  mockGetActiveConnections: vi.fn(),
  mockIsPropertySupabaseConfigured: vi.fn(),
  mockLoadActivatedConnectionTools: vi.fn(),
  mockGetServerEnv: vi.fn(),
}));

vi.mock("ai", () => ({
  streamText: mockStreamText,
  stepCountIs: mockStepCountIs,
}));

vi.mock("@/lib/ai/gateway", () => ({
  gateway: mockGateway,
  getLanguageModel: mockGetLanguageModel,
  gatewayProviderOptions: {},
  TIER_1_MODEL: "google/gemini-3-flash",
}));

vi.mock("@/lib/crm/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crm/config")>();
  return {
    ...actual,
    loadCrmConfig: mockLoadCrmConfig,
  };
});

vi.mock("@/lib/runner/context", () => ({
  assembleContext: mockAssembleContext,
  loadSystemPromptState: mockLoadSystemPromptState,
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

vi.mock("@/lib/chat/messages", () => ({
  createMessages: mockCreateMessages,
}));

vi.mock("@/lib/runner/compaction", () => ({
  maybeCompactThread: (...args: unknown[]) => mockMaybeCompactThread(...args),
}));

vi.mock("@/lib/storage/tool-blocks", () => ({
  saveToolcallBlock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/runner/tools", () => ({
  createCrmTools: mockCreateCrmTools,
  createConnectionTools: mockCreateConnectionTools,
  createMarketTools: mockCreateMarketTools,
  createBrowserTools: vi.fn().mockReturnValue({}),
  createListingTools: vi.fn().mockReturnValue({}),
  createStorageTools: mockCreateStorageTools,
  createWebTools: mockCreateWebTools,
  createUtilityTools: mockCreateUtilityTools,
  createTriggerTools: mockCreateTriggerTools,
  createSubagentTool: mockCreateSubagentTool,
}));

vi.mock("@/lib/connections/queries", () => ({
  getActiveConnections: (...args: unknown[]) => mockGetActiveConnections(...args),
}));

vi.mock("@/lib/composio", () => ({
  loadActivatedConnectionTools: (...args: unknown[]) =>
    mockLoadActivatedConnectionTools(...args),
}));

vi.mock("@/lib/supabase/property-env", () => ({
  isPropertySupabaseConfigured: mockIsPropertySupabaseConfigured,
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: (...args: unknown[]) => mockGetServerEnv(...args),
  _resetForTesting: vi.fn(),
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
    mockGetServerEnv.mockReturnValue({ SANDBOX_GOLDEN_SNAPSHOT_ID: "" });
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });
    mockMarkStaleRunsFailed.mockResolvedValue(0);
    mockLoadCrmConfig.mockResolvedValue({ config: {}, hasConfig: false });
    mockCreateMessages.mockResolvedValue([]);
    mockAssembleContext.mockResolvedValue({
      system: "You are Sunder.",
      messages: [{ role: "user", content: "Please use failing_tool" }],
    });
    mockCreateCrmTools.mockReturnValue({});
    mockCreateConnectionTools.mockReturnValue({});
    mockCreateMarketTools.mockReturnValue({});
    mockCreateStorageTools.mockReturnValue({});
    mockCreateWebTools.mockReturnValue({});
    mockCreateUtilityTools.mockReturnValue({});
    mockCreateTriggerTools.mockReturnValue({});
    mockCreateSubagentTool.mockReturnValue({});
    mockMaybeCompactThread.mockResolvedValue(false);
    mockGetActiveConnections.mockResolvedValue([]);
    mockLoadActivatedConnectionTools.mockResolvedValue({});
    mockIsPropertySupabaseConfigured.mockReturnValue(true);
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
          content: [
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "failing_tool",
              input: {},
            },
            {
              type: "tool-error",
              toolCallId: "call-1",
              toolName: "failing_tool",
              input: {},
              error: "Supabase timeout",
            },
          ],
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
          text: "",
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
      promptTokens: 42,
      stepCount: 1,
    });
    expect(mockDrainAndContinue).toHaveBeenCalledWith("mock-supabase-client", {
      clientId: validPayload.clientId,
      threadId: validPayload.threadId,
    });
    expect(mockCreateMessages).toHaveBeenNthCalledWith(2, "mock-supabase-client", [
      {
        thread_id: validPayload.threadId,
        role: "assistant",
        content: "",
        parts: [
          { type: "step-start" },
          {
            type: "tool-failing_tool",
            toolCallId: "call-1",
            state: "output-error",
            input: {},
            errorText: "Supabase timeout",
          },
        ],
      },
    ]);
  });
});
