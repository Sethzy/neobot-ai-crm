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
  mockCreateConnectionTools,
  mockCreateStorageTools,
  mockCreateWebTools,
  mockCreateUtilityTools,
  mockCreateTriggerTools,
  mockCreateMessages,
  mockMaybeCompactThread,
  mockTruncateOversizedParts,
  mockLoadCrmConfig,
  mockGetActiveToolkitSlugs,
  mockLoadComposioTools,
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
  mockCreateConnectionTools: vi.fn(),
  mockCreateStorageTools: vi.fn(),
  mockCreateWebTools: vi.fn(),
  mockCreateUtilityTools: vi.fn(),
  mockCreateTriggerTools: vi.fn(),
  mockCreateMessages: vi.fn(),
  mockMaybeCompactThread: vi.fn(),
  mockTruncateOversizedParts: vi.fn(),
  mockLoadCrmConfig: vi.fn(),
  mockGetActiveToolkitSlugs: vi.fn(),
  mockLoadComposioTools: vi.fn(),
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
  createConnectionTools: mockCreateConnectionTools,
  createStorageTools: mockCreateStorageTools,
  createWebTools: mockCreateWebTools,
  createUtilityTools: mockCreateUtilityTools,
  createTriggerTools: mockCreateTriggerTools,
}));

vi.mock("@/lib/crm/config", () => ({
  loadCrmConfig: mockLoadCrmConfig,
}));

vi.mock("@/lib/connections/queries", () => ({
  getActiveToolkitSlugs: (...args: unknown[]) => mockGetActiveToolkitSlugs(...args),
}));

vi.mock("@/lib/composio", () => ({
  loadComposioTools: (...args: unknown[]) => mockLoadComposioTools(...args),
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
    mockCreateConnectionTools.mockReturnValue({
      list_users_connections: { description: "connection-tool" },
      get_details_for_connections: { description: "connection-tool" },
      search_for_integrations: { description: "connection-tool" },
      get_integrations_capabilities: { description: "connection-tool" },
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
    mockCreateTriggerTools.mockReturnValue({
      search_triggers: { description: "trigger-tool" },
      setup_trigger: { description: "trigger-tool" },
      manage_active_triggers: { description: "trigger-tool" },
    });
    mockAssembleContext.mockResolvedValue({
      system: "You are Sunder.",
      messages: [{ role: "user", content: "Hello, Sunder!" }],
    });
    mockTruncateOversizedParts.mockImplementation(async (_supabase, _clientId, parts) => ({
      parts,
      recoveryPaths: [],
    }));
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
    mockGetActiveToolkitSlugs.mockResolvedValue([]);
    mockLoadComposioTools.mockResolvedValue({});
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
          search_triggers: { description: "trigger-tool" },
          setup_trigger: { description: "trigger-tool" },
          manage_active_triggers: { description: "trigger-tool" },
          list_users_connections: { description: "connection-tool" },
          get_details_for_connections: { description: "connection-tool" },
          search_for_integrations: { description: "connection-tool" },
          get_integrations_capabilities: { description: "connection-tool" },
        },
      }),
    );
    expect(mockCreateCrmTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      {
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

  it("always enables CRM write tools regardless of environment", async () => {
    process.env.VERCEL_ENV = "production";
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    await runAgent(validPayload, "mock-supabase-client" as never);

    expect(mockCreateCrmTools).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
      expect.objectContaining({ allowWriteTools: true, mode: "normal" }),
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
      }),
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

  it("loads Composio tools from active connection toolkits and merges them into the runner toolset", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });
    mockGetActiveToolkitSlugs.mockResolvedValue(["gmail"]);
    mockLoadComposioTools.mockResolvedValue({
      GMAIL_FETCH_EMAILS: { description: "composio-tool" },
    });

    await runAgent(validPayload, "mock-supabase-client" as never);

    expect(mockGetActiveToolkitSlugs).toHaveBeenCalledWith(
      "mock-supabase-client",
      validPayload.clientId,
    );
    expect(mockLoadComposioTools).toHaveBeenCalledWith(validPayload.clientId, ["gmail"]);
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.objectContaining({
          search_contacts: { description: "tool" },
          GMAIL_FETCH_EMAILS: { description: "composio-tool" },
        }),
      }),
    );
  });

  it("keeps the runner toolset unchanged when Composio tools resolve to an empty object", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });
    mockGetActiveToolkitSlugs.mockResolvedValue(["gmail"]);
    mockLoadComposioTools.mockResolvedValue({});

    await runAgent(validPayload, "mock-supabase-client" as never);

    expect(mockLoadComposioTools).toHaveBeenCalledWith(validPayload.clientId, ["gmail"]);
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.not.objectContaining({
          GMAIL_FETCH_EMAILS: expect.anything(),
        }),
      }),
    );
  });

  it("falls back to the base runner tools when active connection lookup fails", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });
    mockGetActiveToolkitSlugs.mockRejectedValue(new Error("connections unavailable"));

    await runAgent(validPayload, "mock-supabase-client" as never);

    expect(mockLoadComposioTools).not.toHaveBeenCalled();
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.objectContaining({
          search_contacts: { description: "tool" },
        }),
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
    expect(mockAssembleContext).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase: "mock-supabase-client",
        threadId: validPayload.threadId,
        currentMessage: "",
        clientId: validPayload.clientId,
        crmMode: "normal",
        crmConfig: expect.objectContaining({ deal_label: "Policy" }),
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
