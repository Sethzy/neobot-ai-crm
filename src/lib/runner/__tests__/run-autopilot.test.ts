/**
 * Tests for autonomous pulse execution.
 * @module lib/runner/__tests__/run-autopilot
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGenerateText,
  mockStepCountIs,
  mockGateway,
  mockAssembleContext,
  mockCreateRun,
  mockCompleteRun,
  mockMarkStaleRunsFailed,
  mockDrainAndContinue,
  mockCreateCrmTools,
  mockCreateConnectionTools,
  mockCreateStorageTools,
  mockCreateWebTools,
  mockCreateUtilityTools,
  mockCreateTriggerTools,
  mockCreateViewTools,
  mockCreateSubagentTool,
  mockCreateMessages,
  mockMaybeCompactThread,
  mockTruncateOversizedParts,
  mockBuildAssistantPartsFromSteps,
  mockGetAssistantTextFromParts,
  mockGetActiveConnections,
  mockLoadActivatedConnectionTools,
} = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
  mockStepCountIs: vi.fn(() => vi.fn(() => true)),
  mockGateway: vi.fn(() => "mock-model"),
  mockAssembleContext: vi.fn(),
  mockCreateRun: vi.fn(),
  mockCompleteRun: vi.fn(),
  mockMarkStaleRunsFailed: vi.fn(),
  mockDrainAndContinue: vi.fn(),
  mockCreateCrmTools: vi.fn(),
  mockCreateConnectionTools: vi.fn(),
  mockCreateStorageTools: vi.fn(),
  mockCreateWebTools: vi.fn(),
  mockCreateUtilityTools: vi.fn(),
  mockCreateTriggerTools: vi.fn(),
  mockCreateViewTools: vi.fn(),
  mockCreateSubagentTool: vi.fn(),
  mockCreateMessages: vi.fn(),
  mockMaybeCompactThread: vi.fn(),
  mockTruncateOversizedParts: vi.fn(),
  mockBuildAssistantPartsFromSteps: vi.fn(),
  mockGetAssistantTextFromParts: vi.fn(),
  mockGetActiveConnections: vi.fn(),
  mockLoadActivatedConnectionTools: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mockGenerateText,
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

vi.mock("@/lib/runner/drain-and-continue", () => ({
  drainAndContinue: mockDrainAndContinue,
}));

vi.mock("@/lib/runner/tools", () => ({
  createCrmTools: mockCreateCrmTools,
  createConnectionTools: mockCreateConnectionTools,
  createStorageTools: mockCreateStorageTools,
  createSubagentTool: mockCreateSubagentTool,
  createWebTools: mockCreateWebTools,
  createUtilityTools: mockCreateUtilityTools,
  createTriggerTools: mockCreateTriggerTools,
  createViewTools: mockCreateViewTools,
}));

vi.mock("@/lib/chat/messages", () => ({
  createMessages: (...args: unknown[]) => mockCreateMessages(...args),
}));

vi.mock("@/lib/runner/compaction", () => ({
  maybeCompactThread: (...args: unknown[]) => mockMaybeCompactThread(...args),
}));

vi.mock("@/lib/runner/toolcall-artifacts", () => ({
  saveToolcallBlock: vi.fn().mockResolvedValue(undefined),
  truncateOversizedParts: (...args: unknown[]) => mockTruncateOversizedParts(...args),
}));

vi.mock("@/lib/runner/message-utils", () => ({
  buildAssistantPartsFromSteps: (...args: unknown[]) => mockBuildAssistantPartsFromSteps(...args),
  getAssistantTextFromParts: (...args: unknown[]) => mockGetAssistantTextFromParts(...args),
}));
vi.mock("@/lib/connections/queries", () => ({
  getActiveConnections: (...args: unknown[]) => mockGetActiveConnections(...args),
}));
vi.mock("@/lib/composio", () => ({
  loadActivatedConnectionTools: (...args: unknown[]) =>
    mockLoadActivatedConnectionTools(...args),
}));

import { runAutopilot } from "../run-autopilot";

describe("runAutopilot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkStaleRunsFailed.mockResolvedValue(0);
    mockCreateCrmTools.mockReturnValue({ search_tasks: { description: "tool" } });
    mockCreateConnectionTools.mockReturnValue({
      list_users_connections: { description: "connection-tool" },
      get_details_for_connections: { description: "connection-tool" },
      search_for_integrations: { description: "connection-tool" },
      get_integrations_capabilities: { description: "connection-tool" },
    });
    mockCreateStorageTools.mockReturnValue({ read_file: { description: "tool" } });
    mockCreateWebTools.mockReturnValue({ web_search: { description: "tool" } });
    mockCreateUtilityTools.mockReturnValue({ list_todo: { description: "tool" } });
    mockCreateTriggerTools.mockReturnValue({
      search_triggers: { description: "tool" },
      manage_active_triggers: { description: "tool" },
    });
    mockCreateViewTools.mockReturnValue({
      show_view: { description: "view-tool" },
    });
    mockCreateSubagentTool.mockReturnValue({
      run_subagent: { description: "subagent-tool" },
    });
    mockAssembleContext.mockResolvedValue({
      system: "system prompt",
      messages: [{ role: "assistant", content: "Previous autopilot update" }],
    });
    mockBuildAssistantPartsFromSteps.mockReturnValue([]);
    mockGetAssistantTextFromParts.mockReturnValue("");
    mockTruncateOversizedParts.mockResolvedValue({ parts: [], recoveryPaths: [] });
    mockMaybeCompactThread.mockResolvedValue(false);
    mockCreateMessages.mockResolvedValue([]);
    mockGetActiveConnections.mockResolvedValue([]);
    mockLoadActivatedConnectionTools.mockResolvedValue({});
  });

  it("injects autopilot instructions and executes generateText with tool-loop settings", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });
    mockGenerateText.mockResolvedValue({
      text: "Autopilot completed a useful task.",
      steps: [],
      totalUsage: { inputTokens: 120, outputTokens: 45 },
    });

    const result = await runAutopilot({
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      supabase: "supabase" as never,
    });

    expect(result).toEqual({ status: "completed" });
    expect(mockAssembleContext).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining("autonomous pulse"),
      }),
    );
    expect(mockStepCountIs).toHaveBeenCalledWith(9);
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "mock-model",
        system: "system prompt",
        stopWhen: expect.any(Function),
        tools: expect.objectContaining({
          search_triggers: { description: "tool" },
          manage_active_triggers: { description: "tool" },
          show_view: { description: "view-tool" },
          run_subagent: { description: "subagent-tool" },
          list_users_connections: { description: "connection-tool" },
          get_details_for_connections: { description: "connection-tool" },
          search_for_integrations: { description: "connection-tool" },
          get_integrations_capabilities: { description: "connection-tool" },
        }),
      }),
    );
    expect(mockCreateTriggerTools).toHaveBeenCalledWith(
      "supabase",
      "550e8400-e29b-41d4-a716-446655440000",
      "660e8400-e29b-41d4-a716-446655440000",
      { allowMutations: false },
    );
    expect(mockCreateConnectionTools).toHaveBeenCalledWith(
      "supabase",
      "550e8400-e29b-41d4-a716-446655440000",
      { allowMutations: false },
    );
    expect(mockCreateSubagentTool).toHaveBeenCalledWith(
      "supabase",
      "550e8400-e29b-41d4-a716-446655440000",
      "660e8400-e29b-41d4-a716-446655440000",
      expect.objectContaining({
        parentRunId: "run-1",
      }),
    );
  });

  it("passes the persisted autopilot run type when claiming a lock", async () => {
    mockCreateRun.mockResolvedValue({ created: false });

    await runAutopilot({
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      supabase: "supabase" as never,
    });

    expect(mockCreateRun).toHaveBeenCalledWith("supabase", {
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      runType: "autopilot",
    });
  });

  it("does not enqueue or create a synthetic user message when the thread is busy", async () => {
    mockCreateRun.mockResolvedValue({ created: false });

    const result = await runAutopilot({
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      supabase: "supabase" as never,
    });

    expect(result).toEqual({ status: "skipped_busy" });
    expect(mockGenerateText).not.toHaveBeenCalled();
    expect(mockCreateMessages).not.toHaveBeenCalled();
  });

  it("completes the run using total usage across all steps", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });
    mockGenerateText.mockResolvedValue({
      text: "Done",
      steps: [{ text: "Done" }],
      totalUsage: { inputTokens: 200, outputTokens: 100 },
    });

    await runAutopilot({
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      supabase: "supabase" as never,
    });

    expect(mockCompleteRun).toHaveBeenCalledWith(
      "supabase",
      expect.objectContaining({
        runId: "run-1",
        status: "completed",
        tokensIn: 200,
        tokensOut: 100,
        stepCount: 1,
      }),
    );
  });

  it("marks the run failed when generateText throws", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });
    mockGenerateText.mockRejectedValue(new Error("LLM timeout"));

    const result = await runAutopilot({
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      supabase: "supabase" as never,
    });

    expect(result).toEqual({ status: "failed", error: "LLM timeout" });
    expect(mockCompleteRun).toHaveBeenCalledWith(
      "supabase",
      expect.objectContaining({ status: "failed" }),
    );
  });
});
