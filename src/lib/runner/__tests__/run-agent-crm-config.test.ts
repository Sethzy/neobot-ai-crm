/**
 * Tests CRM-config-aware runner orchestration.
 * @module lib/runner/__tests__/run-agent-crm-config
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CRM_DEFAULTS } from "@/lib/crm/config";
import type { RunnerPayload } from "../schemas";

const {
  mockStreamText,
  mockStepCountIs,
  mockGateway,
  mockGetLanguageModel,
  mockAssembleContext,
  mockLoadSystemPromptState,
  mockCreateRun,
  mockMarkStaleRunsFailed,
  mockCreateCrmTools,
  mockCreateConnectionTools,
  mockCreateMarketTools,
  mockCreateStorageTools,
  mockCreateWebTools,
  mockCreateUtilityTools,
  mockCreateTriggerTools,
  mockCreateSubagentTool,
  mockCreateMessages,
  mockLoadCrmConfig,
  mockFinalizeRun,
  mockGetActiveConnections,
  mockIsPropertySupabaseConfigured,
  mockLoadActivatedConnectionTools,
  mockGetServerEnv,
} = vi.hoisted(() => ({
  mockStreamText: vi.fn(),
  mockStepCountIs: vi.fn(() => vi.fn(() => true)),
  mockGateway: vi.fn(() => "mock-model"),
  mockGetLanguageModel: vi.fn((modelId: string) => `language-model:${modelId}`),
  mockAssembleContext: vi.fn(),
  mockLoadSystemPromptState: vi.fn().mockResolvedValue({
    userSkills: [],
    compactionState: null,
  }),
  mockCreateRun: vi.fn(),
  mockMarkStaleRunsFailed: vi.fn(),
  mockCreateCrmTools: vi.fn(),
  mockCreateConnectionTools: vi.fn(),
  mockCreateMarketTools: vi.fn(),
  mockCreateStorageTools: vi.fn(),
  mockCreateWebTools: vi.fn(),
  mockCreateUtilityTools: vi.fn(),
  mockCreateTriggerTools: vi.fn(),
  mockCreateSubagentTool: vi.fn(),
  mockCreateMessages: vi.fn(),
  mockLoadCrmConfig: vi.fn(),
  mockFinalizeRun: vi.fn(),
  mockGetActiveConnections: vi.fn(),
  mockIsPropertySupabaseConfigured: vi.fn(),
  mockLoadActivatedConnectionTools: vi.fn(),
  mockGetServerEnv: vi.fn(),
}));

vi.mock("ai", () => ({
  streamText: mockStreamText,
  stepCountIs: mockStepCountIs,
  hasToolCall: () => () => false,
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
  completeRun: vi.fn(),
  markStaleRunsFailed: mockMarkStaleRunsFailed,
}));

vi.mock("@/lib/runner/run-persistence", () => ({
  finalizeRun: mockFinalizeRun,
}));

vi.mock("@/lib/runner/thread-queue", () => ({
  enqueueMessage: vi.fn(),
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

vi.mock("@/lib/chat/messages", () => ({
  createMessages: (...args: unknown[]) => mockCreateMessages(...args),
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

const validPayload: RunnerPayload = {
  clientId: "550e8400-e29b-41d4-a716-446655440000",
  threadId: "660e8400-e29b-41d4-a716-446655440000",
  triggerType: "chat",
  input: "Hello, Sunder!",
};

describe("runAgent CRM configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerEnv.mockReturnValue({ SANDBOX_GOLDEN_SNAPSHOT_ID: "" });
    mockMarkStaleRunsFailed.mockResolvedValue(0);
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });
    mockLoadCrmConfig.mockResolvedValue({
      config: {
        ...CRM_DEFAULTS,
        deal_label: "Policy",
        deal_stages: ["lead", "quoted", "bound"],
      },
      hasConfig: false,
    });
    mockCreateCrmTools.mockReturnValue({ search_contacts: { description: "tool" } });
    mockCreateConnectionTools.mockReturnValue({});
    mockCreateMarketTools.mockReturnValue({ search_market_data: { description: "market" } });
    mockCreateStorageTools.mockReturnValue({ read_file: { description: "storage" } });
    mockCreateWebTools.mockReturnValue({ web_search: { description: "web" } });
    mockCreateUtilityTools.mockReturnValue({ manage_todo: { description: "utility" } });
    mockCreateTriggerTools.mockReturnValue({ search_triggers: { description: "trigger" } });
    mockCreateSubagentTool.mockReturnValue({});
    mockAssembleContext.mockResolvedValue({
      system: "system",
      messages: [{ role: "user", content: "Hello, Sunder!" }],
    });
    mockCreateMessages.mockResolvedValue([]);
    mockGetActiveConnections.mockResolvedValue([]);
    mockLoadActivatedConnectionTools.mockResolvedValue({
      tools: {},
      activatedSlugs: new Set<string>(),
    });
    mockIsPropertySupabaseConfigured.mockReturnValue(true);
    mockStreamText.mockReturnValue({ toUIMessageStream: vi.fn(() => new ReadableStream()) });
  });

  it("loads CRM config once and stays in normal mode when no config row exists", async () => {
    await runAgent(validPayload, "mock-supabase-client" as never);

    expect(mockLoadCrmConfig).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
    );
    expect(mockAssembleContext).toHaveBeenCalledWith(
      expect.objectContaining({
        crmMode: "normal",
        crmConfig: expect.objectContaining({
          deal_label: "Policy",
          deal_stages: ["lead", "quoted", "bound"],
        }),
      }),
    );
    expect(mockCreateCrmTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      expect.objectContaining({
        allowWriteTools: true,
        mode: "normal",
        config: expect.objectContaining({
          deal_label: "Policy",
          deal_stages: ["lead", "quoted", "bound"],
        }),
      }),
    );
  });

  it("always builds CRM tools without a config-mode registry flag", async () => {
    await runAgent(validPayload, "mock-supabase-client" as never);

    expect(mockCreateCrmTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      expect.not.objectContaining({
        includeConfigTool: expect.anything(),
      }),
    );
  });

  it("uses explicit setup mode instead of heuristics", async () => {
    await runAgent(
      {
        ...validPayload,
        crmMode: "setup",
      } as RunnerPayload,
      "mock-supabase-client" as never,
    );

    expect(mockAssembleContext).toHaveBeenCalledWith(
      expect.objectContaining({ crmMode: "setup" }),
    );
    expect(mockCreateCrmTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      expect.objectContaining({ mode: "setup" }),
    );
  });
});
