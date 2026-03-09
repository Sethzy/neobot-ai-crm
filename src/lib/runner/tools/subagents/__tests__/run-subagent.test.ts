/**
 * Tests for the isolated run_subagent tool.
 * @module lib/runner/tools/subagents/__tests__/run-subagent
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGenerateText,
  mockStepCountIs,
  mockTool,
  mockGateway,
  mockAssembleSystemOnly,
  mockCreateRunnerTools,
  mockCreateSubagentRun,
  mockCompleteRun,
  mockSaveToolcallBlock,
  mockCreateAgentFileClient,
} = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
  mockStepCountIs: vi.fn(() => "stop"),
  mockTool: vi.fn((definition: unknown) => definition),
  mockGateway: vi.fn(() => "gateway-model"),
  mockAssembleSystemOnly: vi.fn(),
  mockCreateRunnerTools: vi.fn(),
  mockCreateSubagentRun: vi.fn(),
  mockCompleteRun: vi.fn(),
  mockSaveToolcallBlock: vi.fn(),
  mockCreateAgentFileClient: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mockGenerateText,
  stepCountIs: mockStepCountIs,
  tool: mockTool,
}));

vi.mock("@/lib/ai/gateway", () => ({
  gateway: mockGateway,
  TIER_1_MODEL: "google/gemini-3-flash",
}));

vi.mock("@/lib/runner/context", () => ({
  assembleSystemOnly: mockAssembleSystemOnly,
}));

vi.mock("@/lib/runner/tool-registry", () => ({
  createRunnerTools: mockCreateRunnerTools,
}));

vi.mock("@/lib/runner/run-lifecycle", () => ({
  createSubagentRun: mockCreateSubagentRun,
  completeRun: mockCompleteRun,
}));

vi.mock("@/lib/runner/toolcall-artifacts", () => ({
  saveToolcallBlock: mockSaveToolcallBlock,
}));

vi.mock("@/lib/storage/agent-files", () => ({
  createAgentFileClient: mockCreateAgentFileClient,
}));

import { createSubagentTool } from "../run-subagent";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const THREAD_ID = "660e8400-e29b-41d4-a716-446655440000";
const PARENT_RUN_ID = "770e8400-e29b-41d4-a716-446655440000";

describe("createSubagentTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssembleSystemOnly.mockResolvedValue("system prompt");
    mockCreateRunnerTools.mockReturnValue({
      search_contacts: { description: "tool" },
    });
    mockCreateSubagentRun.mockResolvedValue({ runId: "sub-run-1" });
    mockCompleteRun.mockResolvedValue(undefined);
    mockSaveToolcallBlock.mockResolvedValue(undefined);
    mockCreateAgentFileClient.mockReturnValue({
      downloadFile: vi.fn().mockResolvedValue("# Briefing\n\nSummarize the lead."),
    });
    mockGenerateText.mockResolvedValue({
      text: "Final briefing text",
      steps: [
        {
          toolCalls: [
            {
              toolCallId: "call-1",
              toolName: "search_contacts",
              input: { query: "Jane Chen" },
            },
          ],
          toolResults: [
            {
              toolCallId: "call-1",
              toolName: "search_contacts",
              output: { contacts: [] },
            },
          ],
        },
      ],
      totalUsage: {
        inputTokens: 120,
        outputTokens: 45,
      },
      usage: {
        inputTokens: 1,
        outputTokens: 1,
      },
    });
  });

  it("runs in isolation with a single user message and returns raw text", async () => {
    const { run_subagent } = createSubagentTool(
      "supabase" as never,
      CLIENT_ID,
      THREAD_ID,
      {
        parentRunId: PARENT_RUN_ID,
      },
    );

    const result = await run_subagent.execute(
      {
        action_pending: "Preparing briefing…",
        action_finished: "Briefing ready",
        action_error: "Briefing failed",
        path: "subagents/triggers/morning-briefing.md",
        payload: '{"invitee":"Jane Chen"}',
      },
      { abortSignal: new AbortController().signal } as never,
    );

    expect(result).toBe("Final briefing text");
    expect(mockAssembleSystemOnly).toHaveBeenCalledWith({
      supabase: "supabase",
      clientId: CLIENT_ID,
      threadId: THREAD_ID,
      crmConfig: undefined,
      crmMode: "normal",
    });
    expect(mockCreateRunnerTools).toHaveBeenCalledWith(
      "supabase",
      CLIENT_ID,
      THREAD_ID,
      {
        allowTriggerMutations: false,
        allowConnectionMutations: false,
        isSubagent: true,
        includeSendMessage: false,
        crmConfig: undefined,
        crmMode: "normal",
      },
    );
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: "system prompt",
        messages: [
          {
            role: "user",
            content: '# Briefing\n\nSummarize the lead.\n\n{"invitee":"Jane Chen"}',
          },
        ],
        tools: {
          search_contacts: { description: "tool" },
        },
      }),
    );
  });

  it("creates a child run and logs completion with total usage", async () => {
    const { run_subagent } = createSubagentTool(
      "supabase" as never,
      CLIENT_ID,
      THREAD_ID,
      {
        parentRunId: PARENT_RUN_ID,
      },
    );

    await run_subagent.execute(
      {
        action_pending: "Preparing briefing…",
        action_finished: "Briefing ready",
        action_error: "Briefing failed",
        path: "subagents/triggers/morning-briefing.md",
      },
      { abortSignal: new AbortController().signal } as never,
    );

    expect(mockCreateSubagentRun).toHaveBeenCalledWith("supabase", {
      threadId: THREAD_ID,
      clientId: CLIENT_ID,
      parentRunId: PARENT_RUN_ID,
    });
    expect(mockCompleteRun).toHaveBeenCalledWith("supabase", {
      runId: "sub-run-1",
      status: "completed",
      model: "google/gemini-3-flash",
      tokensIn: 120,
      tokensOut: 45,
      stepCount: 1,
    });
  });

  it("persists tool call blocks for subagent steps", async () => {
    const { run_subagent } = createSubagentTool(
      "supabase" as never,
      CLIENT_ID,
      THREAD_ID,
      {
        parentRunId: PARENT_RUN_ID,
      },
    );

    await run_subagent.execute(
      {
        action_pending: "Preparing briefing…",
        action_finished: "Briefing ready",
        action_error: "Briefing failed",
        path: "subagents/triggers/morning-briefing.md",
      },
      { abortSignal: new AbortController().signal } as never,
    );

    expect(mockSaveToolcallBlock).toHaveBeenCalledWith(
      "supabase",
      CLIENT_ID,
      "call-1",
      { query: "Jane Chen" },
      { contacts: [] },
    );
  });

  it("marks the child run failed when the instruction file is missing", async () => {
    mockCreateAgentFileClient.mockReturnValue({
      downloadFile: vi.fn().mockRejectedValue(new Error("missing")),
    });

    const { run_subagent } = createSubagentTool(
      "supabase" as never,
      CLIENT_ID,
      THREAD_ID,
      {
        parentRunId: PARENT_RUN_ID,
      },
    );

    await expect(
      run_subagent.execute(
        {
          action_pending: "Preparing briefing…",
          action_finished: "Briefing ready",
          action_error: "Briefing failed",
          path: "subagents/triggers/missing.md",
        },
        { abortSignal: new AbortController().signal } as never,
      ),
    ).rejects.toThrow("Instruction file not found: subagents/triggers/missing.md");

    expect(mockCompleteRun).toHaveBeenCalledWith("supabase", {
      runId: "sub-run-1",
      status: "failed",
      model: "google/gemini-3-flash",
      tokensIn: 0,
      tokensOut: 0,
    });
  });
});
