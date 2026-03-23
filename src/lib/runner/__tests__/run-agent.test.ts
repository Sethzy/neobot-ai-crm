/**
 * Tests for the runner core loop orchestration.
 * @module lib/runner/__tests__/run-agent
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockStreamText,
  mockStepCountIs,
  mockGateway,
  mockCaptureServerEvent,
  mockAssembleContext,
  mockCreateRun,
  mockCompleteRun,
  mockMarkStaleRunsFailed,
  mockEnqueueMessage,
  mockDrainAndContinue,
  mockCreateCrmTools,
  mockCreateConnectionTools,
  mockCreateMarketTools,
  mockCreateListingTools,
  mockCreateBrowserTools,
  mockCreateStorageTools,
  mockCreateWebTools,
  mockCreateUtilityTools,
  mockCreateTriggerTools,
  mockCreateSubagentTool,
  mockCreateMessages,
  mockMaybeCompactThread,
  mockDeliverToExternalChannels,
  mockHasExternalDeliverables,
  mockLoadCrmConfig,
  mockGetActiveConnections,
  mockLoadActivatedConnectionTools,
  mockConsumeMessageQuota,
  mockIsApifyConfigured,
  mockIsPropertySupabaseConfigured,
  mockReleaseMessageQuota,
} = vi.hoisted(() => ({
  mockStreamText: vi.fn(),
  mockStepCountIs: vi.fn(() => vi.fn(() => true)),
  mockGateway: vi.fn(() => "mock-model"),
  mockCaptureServerEvent: vi.fn(),
  mockAssembleContext: vi.fn(),
  mockCreateRun: vi.fn(),
  mockCompleteRun: vi.fn(),
  mockMarkStaleRunsFailed: vi.fn(),
  mockEnqueueMessage: vi.fn(),
  mockDrainAndContinue: vi.fn(),
  mockCreateCrmTools: vi.fn(),
  mockCreateConnectionTools: vi.fn(),
  mockCreateMarketTools: vi.fn(),
  mockCreateListingTools: vi.fn(),
  mockCreateBrowserTools: vi.fn(),
  mockCreateStorageTools: vi.fn(),
  mockCreateWebTools: vi.fn(),
  mockCreateUtilityTools: vi.fn(),
  mockCreateTriggerTools: vi.fn(),
  mockCreateSubagentTool: vi.fn(),
  mockCreateMessages: vi.fn(),
  mockMaybeCompactThread: vi.fn(),
  mockDeliverToExternalChannels: vi.fn(),
  mockHasExternalDeliverables: vi.fn(() => false),
  mockLoadCrmConfig: vi.fn(),
  mockGetActiveConnections: vi.fn(),
  mockLoadActivatedConnectionTools: vi.fn(),
  mockConsumeMessageQuota: vi.fn(),
  mockIsApifyConfigured: vi.fn(),
  mockIsPropertySupabaseConfigured: vi.fn(),
  mockReleaseMessageQuota: vi.fn(),
}));

vi.mock("ai", () => ({
  streamText: mockStreamText,
  stepCountIs: mockStepCountIs,
}));

vi.mock("@/lib/ai/gateway", () => ({
  gateway: mockGateway,
  gatewayProviderOptions: {},
  TIER_1_MODEL: "google/gemini-3-flash",
}));

vi.mock("@/lib/analytics/posthog-server", () => ({
  captureServerEvent: (...args: unknown[]) => mockCaptureServerEvent(...args),
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
  createConnectionTools: mockCreateConnectionTools,
  createMarketTools: mockCreateMarketTools,
  createListingTools: mockCreateListingTools,
  createBrowserTools: mockCreateBrowserTools,
  createStorageTools: mockCreateStorageTools,
  createSubagentTool: mockCreateSubagentTool,
  createWebTools: mockCreateWebTools,
  createUtilityTools: mockCreateUtilityTools,
  createTriggerTools: mockCreateTriggerTools,
}));

vi.mock("@/lib/crm/config", () => ({
  loadCrmConfig: mockLoadCrmConfig,
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

vi.mock("@/lib/apify/env", () => ({
  isApifyConfigured: mockIsApifyConfigured,
}));

vi.mock("@/lib/usage/message-quota", () => ({
  consumeMessageQuota: (...args: unknown[]) => mockConsumeMessageQuota(...args),
  releaseMessageQuota: (...args: unknown[]) => mockReleaseMessageQuota(...args),
  messageQuotaErrorCodes: {
    limitReached: "message-quota-exceeded",
    loadFailed: "message-quota-load-failed",
  },
  MessageQuotaError: class MessageQuotaError extends Error {
    code: string;
    quota: unknown;

    constructor(code: string, message: string, options?: { quota?: unknown }) {
      super(message);
      this.name = "MessageQuotaError";
      this.code = code;
      this.quota = options?.quota ?? null;
    }
  },
}));

vi.mock("@/lib/chat/messages", () => ({
  createMessages: (...args: unknown[]) => mockCreateMessages(...args),
}));

vi.mock("@/lib/runner/compaction", () => ({
  maybeCompactThread: (...args: unknown[]) => mockMaybeCompactThread(...args),
}));

vi.mock("@/lib/storage/tool-blocks", () => ({
  saveToolcallBlock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/channels/deliver", () => ({
  deliverToExternalChannels: (...args: unknown[]) => mockDeliverToExternalChannels(...args),
  hasExternalDeliverables: (...args: unknown[]) => mockHasExternalDeliverables(...args),
}));

import type { RunnerPayload } from "../schemas";
import { buildPrepareStep, runAgent } from "../run-agent";
import { createRunnerTools } from "../tool-registry";

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
    mockCreateConnectionTools.mockReturnValue({
      list_users_connections: { description: "connection-tool" },
      get_details_for_connections: { description: "connection-tool" },
      search_for_integrations: { description: "connection-tool" },
      get_integrations_capabilities: { description: "connection-tool" },
    });
    mockCreateBrowserTools.mockReturnValue({
      browse_website: { description: "browser-tool" },
    });
    mockCreateMarketTools.mockReturnValue({
      search_market_data: { description: "market-tool" },
    });
    mockCreateListingTools.mockReturnValue({
      search_99co: { description: "listing-tool" },
      search_propertyguru: { description: "listing-tool" },
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
      run_sql: { description: "utility-tool" },
      get_agent_db_schema: { description: "utility-tool" },
    });
    mockCreateTriggerTools.mockReturnValue({
      search_triggers: { description: "trigger-tool" },
      setup_trigger: { description: "trigger-tool" },
      manage_active_triggers: { description: "trigger-tool" },
    });
    mockCreateSubagentTool.mockReturnValue({
      run_subagent: { description: "subagent-tool" },
    });
    mockAssembleContext.mockResolvedValue({
      system: "You are Sunder.",
      messages: [{ role: "user", content: "Hello, Sunder!" }],
    });
    mockLoadCrmConfig.mockResolvedValue({
      hasConfig: true,
      config: {
        deal_label: "Policy",
        deal_stages: ["lead", "quoted", "bound"],
        contact_types: ["prospect", "client"],
        interaction_types: ["call", "email"],
        deal_contact_roles: ["insured", "owner"],
        deal_custom_fields: [],
        contact_custom_fields: [],
        task_custom_fields: [],
      },
    });
    mockMaybeCompactThread.mockResolvedValue(false);
    mockGetActiveConnections.mockResolvedValue([]);
    mockLoadActivatedConnectionTools.mockResolvedValue({});
    mockIsApifyConfigured.mockReturnValue(true);
    mockIsPropertySupabaseConfigured.mockReturnValue(true);
    mockConsumeMessageQuota.mockResolvedValue({
      allowed: true,
      clientId: validPayload.clientId,
      planName: "Free",
      monthlyMessageLimit: 100,
      messagesUsed: 1,
      messagesRemaining: 99,
      periodStart: "2026-03-01",
      nextResetDate: "2026-04-01",
    });
    mockReleaseMessageQuota.mockResolvedValue(true);
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
        tools: expect.objectContaining({
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
          run_sql: { description: "utility-tool" },
          get_agent_db_schema: { description: "utility-tool" },
          search_triggers: { description: "trigger-tool" },
          setup_trigger: { description: "trigger-tool" },
          manage_active_triggers: { description: "trigger-tool" },
          run_subagent: { description: "subagent-tool" },
          list_users_connections: { description: "connection-tool" },
          get_details_for_connections: { description: "connection-tool" },
          search_for_integrations: { description: "connection-tool" },
          get_integrations_capabilities: { description: "connection-tool" },
          search_market_data: { description: "market-tool" },
        }),
      }),
    );
    expect(mockCreateCrmTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      {
        allowDeleteTools: true,
        allowWriteTools: true,
        mode: "normal",
        config: expect.objectContaining({ deal_label: "Policy" }),
      },
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
      {
        isSubagent: false,
        includeSendMessage: true,
      },
    );
    expect(mockCreateTriggerTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      validPayload.threadId,
      { allowMutations: true },
    );
    expect(mockCreateConnectionTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      { allowMutations: true },
    );
  });

  it("passes the persisted run type when claiming a chat run", async () => {
    mockCreateRun.mockResolvedValue({ created: false });

    await runAgent(validPayload, "mock-supabase-client" as never);

    expect(mockCreateRun).toHaveBeenCalledWith("mock-supabase-client", {
      threadId: validPayload.threadId,
      clientId: validPayload.clientId,
      runType: "chat",
    });
  });

  it("builds a restricted tool registry for subagents", () => {
    const tools = createRunnerTools(
      "mock-supabase-client" as never,
      validPayload.clientId,
      validPayload.threadId,
      {
        isSubagent: true,
      },
    );

    expect(tools).toHaveProperty("search_market_data");
    expect(tools).not.toHaveProperty("search_triggers");
    expect(tools).not.toHaveProperty("setup_trigger");
    expect(tools).not.toHaveProperty("manage_active_triggers");
    expect(mockCreateTriggerTools).not.toHaveBeenCalled();
    expect(mockCreateUtilityTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      validPayload.threadId,
      {
        isSubagent: true,
        includeSendMessage: false,
      },
    );
    expect(mockCreateConnectionTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      { allowMutations: false },
    );
    expect(mockCreateCrmTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      expect.objectContaining({
        allowWriteTools: true,
        allowDeleteTools: false,
        mode: "normal",
      }),
    );
  });

  it("always enables CRM write tools regardless of environment", async () => {
    process.env.VERCEL_ENV = "production";
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(validPayload, "mock-supabase-client" as never);

    expect(mockCreateCrmTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      expect.objectContaining({
        allowWriteTools: true,
        allowDeleteTools: true,
        mode: "normal",
      }),
    );
  });

  it("loads CRM config once per run and injects it into context", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

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
        includeMarketData: true,
        includePropertyListings: true,
      }),
    );
  });

  it("switches to explicit setup mode without auto-detecting from missing config", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(
      { ...validPayload, crmMode: "setup" },
      "mock-supabase-client" as never,
    );

    expect(mockCreateCrmTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      expect.objectContaining({
        mode: "setup",
        config: expect.objectContaining({ deal_label: "Policy" }),
      }),
    );
    expect(mockAssembleContext).toHaveBeenCalledWith(
      expect.objectContaining({
        crmMode: "setup",
        crmConfig: expect.objectContaining({
          deal_label: "Policy",
          deal_stages: ["lead", "quoted", "bound"],
        }),
        includeMarketData: true,
        includePropertyListings: true,
      }),
    );
  });

  it("disables market-data prompt injection when property env is not configured", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });
    mockIsPropertySupabaseConfigured.mockReturnValue(false);

    await runAgent(validPayload, "mock-supabase-client" as never);

    expect(mockAssembleContext).toHaveBeenCalledWith(
      expect.objectContaining({
        includeMarketData: false,
      }),
    );
    // Market tools are still registered (stable tool set), but prompt guidance is omitted
    expect(mockCreateMarketTools).toHaveBeenCalled();
  });

  it("disables property-listing prompt injection when Apify is not configured", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });
    mockIsApifyConfigured.mockReturnValue(false);

    await runAgent(validPayload, "mock-supabase-client" as never);

    expect(mockAssembleContext).toHaveBeenCalledWith(
      expect.objectContaining({
        includePropertyListings: false,
      }),
    );
    // Listing tools are still registered (stable tool set), but prompt guidance is omitted
    expect(mockCreateListingTools).toHaveBeenCalled();
  });

  it("passes gatewayProviderOptions to streamText", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(validPayload, "mock-supabase-client" as never);

    const streamCall = mockStreamText.mock.calls[0]?.[0];
    expect(streamCall.providerOptions).toBeDefined();
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
    expect(mockConsumeMessageQuota).not.toHaveBeenCalled();
  });

  it("returns queued without enqueuing when a pulse run finds a busy thread", async () => {
    mockCreateRun.mockResolvedValue({ created: false });

    const result = await runAgent(
      {
        ...validPayload,
        triggerType: "pulse",
        input: "",
      },
      "mock-supabase-client" as never,
    );

    expect(result).toEqual({ status: "queued" });
    expect(mockEnqueueMessage).not.toHaveBeenCalled();
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it("does not create a user message for pulse runs", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(
      {
        ...validPayload,
        triggerType: "pulse",
        input: "",
      },
      "mock-supabase-client" as never,
    );

    expect(mockCreateMessages).not.toHaveBeenCalled();
    expect(mockStreamText).toHaveBeenCalled();
  });

  it("passes instructions through to assembleContext when provided", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(
      {
        ...validPayload,
        triggerType: "pulse",
        input: "",
        instructions: "You are running an autonomous pulse.",
      },
      "mock-supabase-client" as never,
    );

    expect(mockAssembleContext).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: "You are running an autonomous pulse.",
      }),
    );
  });

  it("disables connection mutations for pulse runs", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(
      {
        ...validPayload,
        triggerType: "pulse",
        input: "",
      },
      "mock-supabase-client" as never,
    );

    expect(mockCreateConnectionTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      { allowMutations: false },
    );
  });

  it("keeps connection mutations enabled for cron runs", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(
      {
        ...validPayload,
        triggerType: "cron",
        input: "Process the most recent trigger event.",
      },
      "mock-supabase-client" as never,
    );

    expect(mockCreateConnectionTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      { allowMutations: true },
    );
  });

  it("disables trigger mutations for pulse runs", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(
      {
        ...validPayload,
        triggerType: "pulse",
        input: "",
      },
      "mock-supabase-client" as never,
    );

    expect(mockCreateTriggerTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      validPayload.threadId,
      { allowMutations: false },
    );
  });

  it("always registers browser, market, and listing tools for pulse runs (stable tool set)", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(
      {
        ...validPayload,
        triggerType: "pulse",
        input: "",
      },
      "mock-supabase-client" as never,
    );

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.objectContaining({
          browse_website: expect.anything(),
          search_market_data: expect.anything(),
        }),
      }),
    );
  });

  it("persists pulse runs with autopilot run type", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(
      {
        ...validPayload,
        triggerType: "pulse",
        input: "",
      },
      "mock-supabase-client" as never,
    );

    expect(mockCreateRun).toHaveBeenCalledWith("mock-supabase-client", {
      threadId: validPayload.threadId,
      clientId: validPayload.clientId,
      runType: "autopilot",
    });
  });

  it("consumes quota for direct chat sends before attempting the run", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(
      {
        ...validPayload,
        consumeMessageQuota: true,
      },
      "mock-supabase-client" as never,
    );

    expect(mockConsumeMessageQuota).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
    );
  });

  it("throws a structured error before locking when the monthly cap is exhausted", async () => {
    mockConsumeMessageQuota.mockResolvedValue({
      allowed: false,
      clientId: validPayload.clientId,
      planName: "Free",
      monthlyMessageLimit: 100,
      messagesUsed: 100,
      messagesRemaining: 0,
      periodStart: "2026-03-01",
      nextResetDate: "2026-04-01",
    });

    await expect(
      runAgent(
        {
          ...validPayload,
          consumeMessageQuota: true,
        },
        "mock-supabase-client" as never,
      ),
    ).rejects.toMatchObject({
      code: "message-quota-exceeded",
      quota: expect.objectContaining({
        messagesRemaining: 0,
        messagesUsed: 100,
      }),
    });

    expect(mockCreateRun).not.toHaveBeenCalled();
    expect(mockCreateMessages).not.toHaveBeenCalled();
  });

  it("counts busy-thread direct chat sends once before queueing them", async () => {
    mockCreateRun.mockResolvedValue({ created: false });

    const result = await runAgent(
      {
        ...validPayload,
        consumeMessageQuota: true,
      },
      "mock-supabase-client" as never,
    );

    expect(result).toEqual({ status: "queued" });
    expect(mockConsumeMessageQuota).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
    );
    expect(mockEnqueueMessage).toHaveBeenCalledWith("mock-supabase-client", {
      threadId: validPayload.threadId,
      clientId: validPayload.clientId,
      content: validPayload.input,
      channel: "web",
    });
  });

  it("refunds consumed quota when the direct user input fails before persistence", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });
    mockCreateMessages.mockRejectedValue(new Error("insert failed"));

    await expect(
      runAgent(
        {
          ...validPayload,
          consumeMessageQuota: true,
        },
        "mock-supabase-client" as never,
      ),
    ).rejects.toThrow("insert failed");

    expect(mockReleaseMessageQuota).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      "2026-03-01",
    );
  });

  it("preserves cron trigger metadata when queueing a busy trigger run", async () => {
    mockCreateRun.mockResolvedValue({ created: false });

    const result = await runAgent(
      {
        ...validPayload,
        triggerType: "cron",
        input: "Process the most recent trigger event for this thread.",
      },
      "mock-supabase-client" as never,
    );

    expect(result).toEqual({ status: "queued" });
    expect(mockEnqueueMessage).toHaveBeenCalledWith("mock-supabase-client", {
      threadId: validPayload.threadId,
      clientId: validPayload.clientId,
      content: "Process the most recent trigger event for this thread.",
      channel: "web",
      triggerType: "cron",
    });
  });

  it("queues file parts when a busy chat thread receives an attachment", async () => {
    mockCreateRun.mockResolvedValue({ created: false });

    const result = await runAgent(
      {
        ...validPayload,
        input: "Review this screenshot",
        fileParts: [
          {
            type: "file",
            filename: "shot.png",
            mediaType: "image/png",
            url: "https://storage.example.com/chat-attachments/client-1/shot.png",
          },
        ],
      },
      "mock-supabase-client" as never,
    );

    expect(result).toEqual({ status: "queued" });
    expect(mockEnqueueMessage).toHaveBeenCalledWith("mock-supabase-client", {
      threadId: validPayload.threadId,
      clientId: validPayload.clientId,
      content: "Review this screenshot",
      channel: "web",
      fileParts: [
        {
          type: "file",
          filename: "shot.png",
          mediaType: "image/png",
          url: "https://storage.example.com/chat-attachments/client-1/shot.png",
        },
      ],
    });
  });

  it("preserves a telegram channel hint when queueing a busy chat run", async () => {
    mockCreateRun.mockResolvedValue({ created: false });

    const result = await runAgent(
      {
        ...validPayload,
        input: "Reply from Telegram",
        channel: "telegram",
      },
      "mock-supabase-client" as never,
    );

    expect(result).toEqual({ status: "queued" });
    expect(mockEnqueueMessage).toHaveBeenCalledWith("mock-supabase-client", {
      threadId: validPayload.threadId,
      clientId: validPayload.clientId,
      content: "Reply from Telegram",
      channel: "telegram",
    });
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

    expect(mockAssembleContext).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase: "mock-supabase-client",
        threadId: validPayload.threadId,
        currentMessage: "",
        clientId: validPayload.clientId,
        crmMode: "normal",
        crmConfig: expect.objectContaining({ deal_label: "Policy" }),
        includeMarketData: true,
      }),
    );
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

  it("loads activated Composio tools from active connections and merges them into the runner toolset", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });
    mockGetActiveConnections.mockResolvedValue([{ id: "conn-1" }]);
    mockLoadActivatedConnectionTools.mockResolvedValue({
      "conn-1__GMAIL_FETCH_EMAILS": { description: "composio-tool" },
    });

    await runAgent(validPayload, "mock-supabase-client" as never);

    expect(mockGetActiveConnections).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
    );
    expect(mockLoadActivatedConnectionTools).toHaveBeenCalledWith([
      { id: "conn-1" },
    ]);
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.objectContaining({
          search_contacts: { description: "tool" },
          "conn-1__GMAIL_FETCH_EMAILS": { description: "composio-tool" },
        }),
      }),
    );
    const subagentOptions = mockCreateSubagentTool.mock.calls.at(-1)?.[3];

    expect(subagentOptions).toEqual(
      expect.objectContaining({
        parentRunId: "run-1",
      }),
    );
    expect(subagentOptions).not.toHaveProperty("composioTools");
  });

  it("keeps the runner toolset unchanged when activated Composio tools resolve to an empty object", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });
    mockGetActiveConnections.mockResolvedValue([{ id: "conn-1" }]);
    mockLoadActivatedConnectionTools.mockResolvedValue({});

    await runAgent(validPayload, "mock-supabase-client" as never);

    expect(mockLoadActivatedConnectionTools).toHaveBeenCalledWith([
      { id: "conn-1" },
    ]);
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.not.objectContaining({
          "conn-1__GMAIL_FETCH_EMAILS": expect.anything(),
        }),
      }),
    );
  });

  it("falls back to the base runner tools when active connection lookup fails", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });
    mockGetActiveConnections.mockRejectedValue(new Error("connections unavailable"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await runAgent(validPayload, "mock-supabase-client" as never);

    expect(mockLoadActivatedConnectionTools).not.toHaveBeenCalled();
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.objectContaining({
          search_contacts: { description: "tool" },
        }),
      }),
    );

    consoleSpy.mockRestore();
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
    expect(mockAssembleContext).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase: "mock-supabase-client",
        threadId: validPayload.threadId,
        currentMessage: "",
        clientId: validPayload.clientId,
        crmMode: "normal",
        crmConfig: expect.objectContaining({ deal_label: "Policy" }),
        includeMarketData: true,
      }),
    );
  });

  it("persists inbound multimodal user messages before streaming", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(
      {
        ...validPayload,
        input: "Review this screenshot",
        fileParts: [
          {
            type: "file",
            filename: "shot.png",
            mediaType: "image/png",
            url: "https://storage.example.com/chat-attachments/client-1/shot.png",
          },
        ],
      },
      "mock-supabase-client" as never,
    );

    expect(mockCreateMessages).toHaveBeenCalledWith("mock-supabase-client", [
      {
        thread_id: validPayload.threadId,
        role: "user",
        content: "Review this screenshot",
        parts: [
          {
            type: "file",
            filename: "shot.png",
            mediaType: "image/png",
            url: "https://storage.example.com/chat-attachments/client-1/shot.png",
          },
          { type: "text", text: "Review this screenshot" },
        ],
      },
    ]);
  });

  it("persists image-only user messages with null content and file parts", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(
      {
        ...validPayload,
        input: "",
        fileParts: [
          {
            type: "file",
            filename: "shot.png",
            mediaType: "image/png",
            url: "https://storage.example.com/chat-attachments/client-1/shot.png",
          },
        ],
      },
      "mock-supabase-client" as never,
    );

    expect(mockCreateMessages).toHaveBeenCalledWith("mock-supabase-client", [
      {
        thread_id: validPayload.threadId,
        role: "user",
        content: null,
        parts: [
          {
            type: "file",
            filename: "shot.png",
            mediaType: "image/png",
            url: "https://storage.example.com/chat-attachments/client-1/shot.png",
          },
        ],
      },
    ]);
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

  it("creates read-only trigger tools for cron trigger runs", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(
      {
        ...validPayload,
        triggerType: "cron",
        input: "Process the most recent trigger event for this thread.",
      },
      "mock-supabase-client" as never,
    );

    expect(mockCreateTriggerTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      validPayload.threadId,
      { allowMutations: false },
    );
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
    expect(mockCaptureServerEvent).toHaveBeenCalledWith({
      distinctId: validPayload.clientId,
      event: "agent_run_failed",
      properties: {
        run_id: "run-1",
        thread_id: validPayload.threadId,
        trigger_type: "chat",
        run_type: "chat",
        duration_ms: expect.any(Number),
        error_stage: "startup",
        error_name: "Error",
        error: "Model API error",
      },
    });
  });

  it("records stream errors through onError and skips completion analytics afterwards", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(validPayload, "mock-supabase-client" as never);

    const streamCall = mockStreamText.mock.calls[0]?.[0];
    expect(typeof streamCall.onError).toBe("function");
    expect(typeof streamCall.onFinish).toBe("function");

    await streamCall.onError({
      error: new Error("Tool execution failed"),
    });
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

    expect(mockCompleteRun).toHaveBeenCalledTimes(1);
    expect(mockCompleteRun).toHaveBeenCalledWith("mock-supabase-client", {
      runId: "run-1",
      status: "failed",
      model: "google/gemini-3-flash",
      tokensIn: 0,
      tokensOut: 0,
    });
    expect(mockCaptureServerEvent).toHaveBeenCalledWith({
      distinctId: validPayload.clientId,
      event: "agent_run_failed",
      properties: {
        run_id: "run-1",
        thread_id: validPayload.threadId,
        trigger_type: "chat",
        run_type: "chat",
        duration_ms: expect.any(Number),
        error_stage: "stream",
        error_name: "Error",
        error: "Tool execution failed",
      },
    });
    expect(mockCaptureServerEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "agent_run_completed" }),
    );
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
