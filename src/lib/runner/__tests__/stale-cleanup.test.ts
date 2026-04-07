/**
 * Tests stale run cleanup ordering before lock acquisition.
 * @module lib/runner/__tests__/stale-cleanup
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
  mockEnqueueMessage,
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
  mockEnqueueMessage: vi.fn(),
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
  mockGetActiveConnections: vi.fn(),
  mockIsPropertySupabaseConfigured: vi.fn(),
  mockLoadActivatedConnectionTools: vi.fn(),
  mockGetServerEnv: vi.fn(),
}));

vi.mock("ai", () => ({ streamText: mockStreamText, stepCountIs: mockStepCountIs, hasToolCall: () => () => false }));
vi.mock("@/lib/chat/messages", () => ({
  createMessages: mockCreateMessages,
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
  enqueueMessage: mockEnqueueMessage,
}));
vi.mock("@/lib/runner/drain-and-continue", () => ({
  drainAndContinue: mockDrainAndContinue,
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

describe("stale run cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerEnv.mockReturnValue({ SANDBOX_GOLDEN_SNAPSHOT_ID: "" });
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
    mockGetActiveConnections.mockResolvedValue([]);
    mockLoadActivatedConnectionTools.mockResolvedValue({
      tools: {},
      activatedSlugs: new Set<string>(),
    });
    mockIsPropertySupabaseConfigured.mockReturnValue(true);
    mockStreamText.mockReturnValue({
      toUIMessageStreamResponse: vi.fn(() => new Response("streamed")),
    });
  });

  it("calls stale cleanup before createRun", async () => {
    const order: string[] = [];
    mockMarkStaleRunsFailed.mockImplementation(async () => {
      order.push("markStale");
      return 0;
    });
    mockCreateRun.mockImplementation(async () => {
      order.push("createRun");
      return { created: true, runId: "run-1" };
    });

    await runAgent(
      {
        clientId: "ccc00000-0000-0000-0000-000000000000",
        threadId: "ttt00000-0000-0000-0000-000000000000",
        triggerType: "chat",
        input: "Hello",
      },
      "supabase" as never,
    );

    expect(order).toEqual(["markStale", "createRun"]);
    expect(mockMarkStaleRunsFailed).toHaveBeenCalledWith("supabase", {
      threadId: "ttt00000-0000-0000-0000-000000000000",
    });
  });
});
