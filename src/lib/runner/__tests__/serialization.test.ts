/**
 * Tests per-thread serialization behavior for runAgent.
 * @module lib/runner/__tests__/serialization
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockStreamText,
  mockStepCountIs,
  mockGetLanguageModel,
  mockLoadCrmConfig,
  mockAssembleContext,
  mockLoadSystemPromptState,
  mockCreateRun,
  mockCompleteRun,
  mockMarkStaleRunsFailed,
  mockEnqueueMessage,
  mockCreateCrmTools,
  mockCreateConnectionTools,
  mockCreateMarketTools,
  mockCreateStorageTools,
  mockCreateWebTools,
  mockCreateUtilityTools,
  mockCreateTriggerTools,
  mockCreateSubagentTool,
  mockCreateMessages,
  mockGetActiveConnections,
  mockIsPropertySupabaseConfigured,
  mockLoadActivatedConnectionTools,
  mockGetServerEnv,
} = vi.hoisted(() => ({
  mockStreamText: vi.fn(),
  mockStepCountIs: vi.fn(() => vi.fn(() => true)),
  mockGetLanguageModel: vi.fn(() => "mock-model"),
  mockLoadCrmConfig: vi.fn(),
  mockAssembleContext: vi.fn(),
  mockLoadSystemPromptState: vi.fn(),
  mockCreateRun: vi.fn(),
  mockCompleteRun: vi.fn(),
  mockMarkStaleRunsFailed: vi.fn(),
  mockEnqueueMessage: vi.fn(),
  mockCreateCrmTools: vi.fn(),
  mockCreateConnectionTools: vi.fn(),
  mockCreateMarketTools: vi.fn(),
  mockCreateStorageTools: vi.fn(),
  mockCreateWebTools: vi.fn(),
  mockCreateUtilityTools: vi.fn(),
  mockCreateTriggerTools: vi.fn(),
  mockCreateSubagentTool: vi.fn(),
  mockCreateMessages: vi.fn(),
  mockGetActiveConnections: vi.fn(),
  mockIsPropertySupabaseConfigured: vi.fn(),
  mockLoadActivatedConnectionTools: vi.fn(),
  mockGetServerEnv: vi.fn(),
}));

vi.mock("ai", () => ({ streamText: mockStreamText, stepCountIs: mockStepCountIs, hasToolCall: () => () => false }));
vi.mock("@/lib/chat/messages", () => ({
  createMessages: mockCreateMessages,
}));
vi.mock("@posthog/ai", () => ({
  withTracing: (model: unknown) => model,
}));
vi.mock("@/lib/ai/gateway", () => ({
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
  enqueueMessage: mockEnqueueMessage,
}));
vi.mock("@/lib/runner/tools", () => ({
  createCrmTools: mockCreateCrmTools,
  createConnectionTools: mockCreateConnectionTools,
  createMarketTools: mockCreateMarketTools,
  createMeetingTools: vi.fn().mockReturnValue({}),
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
  loadAllConnectionTools: (...args: unknown[]) =>
    mockLoadActivatedConnectionTools(...args),
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

import { runAgent } from "../run-agent";

const THREAD_A = "aaa00000-0000-0000-0000-000000000000";
const THREAD_B = "bbb00000-0000-0000-0000-000000000000";
const CLIENT = "ccc00000-0000-0000-0000-000000000000";

describe("per-thread serialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkStaleRunsFailed.mockResolvedValue(0);
    mockLoadCrmConfig.mockResolvedValue({ config: {}, hasConfig: false });
    mockCreateMessages.mockResolvedValue([]);
    mockCreateCrmTools.mockReturnValue({
      search_contacts: { description: "tool" },
    });
    mockCreateConnectionTools.mockReturnValue({});
    mockCreateMarketTools.mockReturnValue({});
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
      run_sql: { description: "utility-tool" },
      get_agent_db_schema: { description: "utility-tool" },
    });
    mockCreateTriggerTools.mockReturnValue({
      search_triggers: { description: "trigger-tool" },
      setup_trigger: { description: "trigger-tool" },
      manage_active_triggers: { description: "trigger-tool" },
    });
    mockCreateSubagentTool.mockReturnValue({});
    mockAssembleContext.mockResolvedValue({
      system: "prompt",
      messages: [{ role: "user", content: "test" }],
    });
    mockLoadSystemPromptState.mockResolvedValue({
      memoryContext: undefined,
      userSkills: [],
      systemReminder: undefined,
      compactionState: null,
    });
    mockGetActiveConnections.mockResolvedValue([]);
    mockLoadActivatedConnectionTools.mockResolvedValue({
      tools: {},
      activatedSlugs: new Set<string>(),
    });
    mockIsPropertySupabaseConfigured.mockReturnValue(true);
    mockGetServerEnv.mockReturnValue({
      SANDBOX_GOLDEN_SNAPSHOT_ID: undefined,
      VERCEL_TOKEN: undefined,
      VERCEL_TEAM_ID: undefined,
      VERCEL_PROJECT_ID: undefined,
    });
    mockStreamText.mockReturnValue({
      toUIMessageStreamResponse: vi.fn(() => new Response("streamed")),
    });
  });

  it("starts streaming for first message on idle thread", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-a" });

    const result = await runAgent(
      { clientId: CLIENT, threadId: THREAD_A, triggerType: "chat", input: "Hello" },
      "supabase" as never,
    );

    expect(result.status).toBe("streaming");
    expect(mockStreamText).toHaveBeenCalledTimes(1);
    expect(mockEnqueueMessage).not.toHaveBeenCalled();
  });

  it("queues second message on busy thread", async () => {
    mockCreateRun.mockResolvedValue({ created: false });

    const result = await runAgent(
      { clientId: CLIENT, threadId: THREAD_A, triggerType: "chat", input: "Follow up" },
      "supabase" as never,
    );

    expect(result).toEqual({ status: "queued" });
    expect(mockEnqueueMessage).toHaveBeenCalledWith("supabase", {
      threadId: THREAD_A,
      clientId: CLIENT,
      content: "Follow up",
      channel: "web",
    });
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it("queues busy telegram messages with the external channel preserved", async () => {
    mockCreateRun.mockResolvedValue({ created: false });

    const result = await runAgent(
      {
        clientId: CLIENT,
        threadId: THREAD_A,
        triggerType: "chat",
        input: "Telegram follow up",
        channel: "telegram",
      },
      "supabase" as never,
    );

    expect(result).toEqual({ status: "queued" });
    expect(mockEnqueueMessage).toHaveBeenCalledWith("supabase", {
      threadId: THREAD_A,
      clientId: CLIENT,
      content: "Telegram follow up",
      channel: "telegram",
    });
  });

  it("allows different threads to run concurrently", async () => {
    mockCreateRun
      .mockResolvedValueOnce({ created: true, runId: "run-a" })
      .mockResolvedValueOnce({ created: true, runId: "run-b" });

    const resultA = await runAgent(
      { clientId: CLIENT, threadId: THREAD_A, triggerType: "chat", input: "Thread A" },
      "supabase" as never,
    );
    const resultB = await runAgent(
      { clientId: CLIENT, threadId: THREAD_B, triggerType: "chat", input: "Thread B" },
      "supabase" as never,
    );

    expect(resultA.status).toBe("streaming");
    expect(resultB.status).toBe("streaming");
    expect(mockStreamText).toHaveBeenCalledTimes(2);
  });
});
