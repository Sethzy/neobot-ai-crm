/**
 * Tests for the Telegram webhook route.
 * @module app/api/webhook/telegram/__tests__/route
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAfter,
  mockCreateAdminClient,
  mockCreateTelegramBot,
  mockGetTelegramBotToken,
  mockRunManagedAgent,
  mockResolveApprovalById,
  mockAdvancePendingQuestionBatchByCallback,
  mockAdvancePendingQuestionBatchByTextReply,
  mockClearPendingQuestionsForChat,
  mockDownloadAndStoreTelegramFile,
  mockRestorePendingQuestionBatch,
  mockAttachFileToSession,
  mockGetAnthropicClient,
  mockGetOrCreateSession,
} = vi.hoisted(() => ({
  mockAfter: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockCreateTelegramBot: vi.fn(),
  mockGetTelegramBotToken: vi.fn(),
  mockRunManagedAgent: vi.fn(),
  mockResolveApprovalById: vi.fn(),
  mockAdvancePendingQuestionBatchByCallback: vi.fn(),
  mockAdvancePendingQuestionBatchByTextReply: vi.fn(),
  mockClearPendingQuestionsForChat: vi.fn(),
  mockDownloadAndStoreTelegramFile: vi.fn(),
  mockRestorePendingQuestionBatch: vi.fn(),
  mockAttachFileToSession: vi.fn(),
  mockGetAnthropicClient: vi.fn(),
  mockGetOrCreateSession: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();

  return {
    ...actual,
    after: mockAfter,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock("@/lib/channels/telegram", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/channels/telegram")>();

  return {
    ...actual,
    createTelegramBot: (...args: unknown[]) => mockCreateTelegramBot(...args),
    getTelegramBotToken: (...args: unknown[]) => mockGetTelegramBotToken(...args),
    downloadAndStoreTelegramFile: (...args: unknown[]) => mockDownloadAndStoreTelegramFile(...args),
  };
});

vi.mock("@/lib/managed-agents/adapter", () => ({
  runManagedAgent: (...args: unknown[]) => mockRunManagedAgent(...args),
}));

vi.mock("@/lib/managed-agents/resolve-approval", () => ({
  resolveApprovalById: (...args: unknown[]) => mockResolveApprovalById(...args),
}));

vi.mock("@/lib/managed-agents/attach-session-file", () => ({
  attachFileToSession: (...args: unknown[]) => mockAttachFileToSession(...args),
}));

vi.mock("@/lib/managed-agents/anthropic-client", () => ({
  getAnthropicClient: (...args: unknown[]) => mockGetAnthropicClient(...args),
}));

vi.mock("@/lib/managed-agents/session-kickoff", () => ({
  getOrCreateSession: (...args: unknown[]) => mockGetOrCreateSession(...args),
}));

vi.mock("@/lib/channels/telegram/pending-questions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/channels/telegram/pending-questions")>();

  return {
    ...actual,
    advancePendingQuestionBatchByCallback: (...args: unknown[]) =>
      mockAdvancePendingQuestionBatchByCallback(...args),
    advancePendingQuestionBatchByTextReply: (...args: unknown[]) =>
      mockAdvancePendingQuestionBatchByTextReply(...args),
    clearPendingQuestionsForChat: (...args: unknown[]) => mockClearPendingQuestionsForChat(...args),
    restorePendingQuestionBatch: (...args: unknown[]) => mockRestorePendingQuestionBatch(...args),
  };
});

import { POST } from "../route";

interface MockSupabaseResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

interface MockWebhookSupabaseConfig {
  mappingResults?: MockSupabaseResult[];
  approvalEventResults?: MockSupabaseResult[];
  pairingTokenResults?: MockSupabaseResult[];
  receiptInsertResults?: MockSupabaseResult[];
  threadSelectResults?: MockSupabaseResult[];
  threadInsertResults?: MockSupabaseResult[];
  mappingInsertResults?: MockSupabaseResult[];
  mappingUpdateResults?: MockSupabaseResult[];
  tokenDeleteResults?: MockSupabaseResult[];
}

function takeResult(queue: MockSupabaseResult[] | undefined, fallback: MockSupabaseResult) {
  return queue?.shift() ?? fallback;
}

function createWebhookSupabase(config: MockWebhookSupabaseConfig = {}) {
  const records = {
    inserts: [] as Array<{ table: string; value: unknown }>,
    deletes: [] as Array<{ table: string; filters: Array<[string, unknown]> }>,
  };

  const from = vi.fn((table: string) => {
    if (table === "conversation_channel_mappings") {
      const filters: Array<[string, unknown]> = [];
      const selectChain = {
        eq: vi.fn((field: string, value: unknown) => {
          filters.push([field, value]);
          return selectChain;
        }),
        maybeSingle: vi.fn().mockImplementation(async () =>
          takeResult(config.mappingResults, { data: null, error: null })
        ),
      };

      const deleteFilters: Array<[string, unknown]> = [];
      const deleteChain = {
        eq: vi.fn((field: string, value: unknown) => {
          deleteFilters.push([field, value]);
          return deleteChain;
        }),
        then: async (onfulfilled?: ((value: MockSupabaseResult) => unknown) | null) => {
          const result = { data: null, error: null };
          records.deletes.push({ table, filters: deleteFilters });
          return onfulfilled ? onfulfilled(result) : result;
        },
      };

      return {
        select: vi.fn(() => selectChain),
        insert: vi.fn().mockImplementation(async (value: unknown) => {
          records.inserts.push({ table, value });
          return takeResult(config.mappingInsertResults, { data: null, error: null });
        }),
        update: vi.fn().mockImplementation(() => {
          const updateChain = {
            eq: vi.fn(() => updateChain),
            then: async (onfulfilled?: ((value: MockSupabaseResult) => unknown) | null) => {
              const result = takeResult(config.mappingUpdateResults, { data: null, error: null });
              return onfulfilled ? onfulfilled(result) : result;
            },
          };
          return updateChain;
        }),
        delete: vi.fn(() => deleteChain),
      };
    }

    if (table === "conversation_channel_delivery_receipts") {
      return {
        insert: vi.fn().mockImplementation(async (value: unknown) => {
          records.inserts.push({ table, value });
          return takeResult(config.receiptInsertResults, { data: null, error: null });
        }),
      };
    }

    if (table === "telegram_pairing_tokens") {
      const selectChain = {
        eq: vi.fn(() => selectChain),
        maybeSingle: vi.fn().mockImplementation(async () =>
          takeResult(config.pairingTokenResults, { data: null, error: null })
        ),
      };
      const deleteChain = {
        eq: vi.fn().mockImplementation(async (_field: string, value: unknown) => {
          records.deletes.push({ table, filters: [["token", value]] });
          return takeResult(config.tokenDeleteResults, { data: null, error: null });
        }),
      };

      return {
        select: vi.fn(() => selectChain),
        delete: vi.fn(() => deleteChain),
      };
    }

    if (table === "conversation_threads") {
      const selectChain = {
        eq: vi.fn(() => selectChain),
        single: vi.fn().mockImplementation(async () =>
          takeResult(config.threadSelectResults, { data: null, error: null })
        ),
        maybeSingle: vi.fn().mockImplementation(async () =>
          takeResult(config.threadSelectResults, { data: null, error: null })
        ),
      };

      return {
        select: vi.fn(() => selectChain),
        insert: vi.fn().mockImplementation(async (value: unknown) => {
          records.inserts.push({ table, value });
          return takeResult(config.threadInsertResults, { data: null, error: null });
        }),
      };
    }

    if (table === "approval_events") {
      const selectChain = {
        eq: vi.fn(() => selectChain),
        single: vi.fn().mockImplementation(async () =>
          takeResult(config.approvalEventResults, { data: null, error: null })
        ),
      };

      return {
        select: vi.fn(() => selectChain),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return { from, records };
}

function createTelegramBotApi() {
  return {
    sendChatAction: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue({ message_id: 1, chat: { id: 12345 } }),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    editMessageText: vi.fn().mockResolvedValue(undefined),
  };
}

function createRequest(body: unknown, secret = "telegram-secret") {
  return new Request("http://localhost/api/webhook/telegram", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-bot-api-secret-token": secret,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function flushBackgroundWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("POST /api/webhook/telegram", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELEGRAM_WEBHOOK_SECRET = "telegram-secret";
    mockAfter.mockImplementation(async (callback: () => Promise<void> | void) => {
      await callback();
    });
    mockGetTelegramBotToken.mockReturnValue("123:ABC");
    mockRunManagedAgent.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
    );
    mockResolveApprovalById.mockResolvedValue({
      success: true,
      status: "updated",
      threadId: "thread-1",
    });
    mockAdvancePendingQuestionBatchByCallback.mockResolvedValue({ status: "expired" });
    mockAdvancePendingQuestionBatchByTextReply.mockResolvedValue({ status: "expired" });
    mockClearPendingQuestionsForChat.mockResolvedValue(undefined);
    mockDownloadAndStoreTelegramFile.mockResolvedValue(null);
    mockRestorePendingQuestionBatch.mockResolvedValue(undefined);
    mockAttachFileToSession.mockResolvedValue({
      attached: true,
      anthropicFileId: "file-1",
    });
    mockGetAnthropicClient.mockReturnValue({ beta: {} });
    mockGetOrCreateSession.mockResolvedValue({ id: "session-1" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Blob(["hello"], { type: "image/jpeg" }), { status: 200 }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when the Telegram secret header is invalid", async () => {
    const response = await POST(createRequest({ update_id: 1 }, "wrong-secret"));

    expect(response.status).toBe(401);
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await POST(createRequest("{bad-json"));

    expect(response.status).toBe(400);
  });

  it("acknowledges a mapped regular message and continues the agent in after()", async () => {
    const supabase = createWebhookSupabase({
      mappingResults: [
        {
          data: {
            client_id: "client-1",
            thread_id: "thread-1",
            external_conversation_id: "12345",
          },
          error: null,
        },
      ],
      receiptInsertResults: [{ data: null, error: null }],
    });
    const api = createTelegramBotApi();
    mockCreateAdminClient.mockResolvedValue(supabase);
    mockCreateTelegramBot.mockReturnValue({ api });

    const response = await POST(
      createRequest({
        update_id: 42,
        message: {
          message_id: 7,
          text: "Hello from Telegram",
          chat: { id: 12345, type: "private" },
          from: { id: 9, is_bot: false, first_name: "Seth" },
        },
      }),
    );
    await flushBackgroundWork();

    expect(response.status).toBe(200);
    expect(mockAfter).toHaveBeenCalledTimes(1);
    expect(api.sendChatAction).toHaveBeenCalledWith(12345, "typing");
    expect(mockRunManagedAgent).toHaveBeenCalledWith({
      anthropic: { beta: {} },
      supabase,
      clientId: "client-1",
      threadId: "thread-1",
      input: "Hello from Telegram",
      clientProfile: null,
      userPreferences: null,
      threadTitle: null,
    });
  });

  it("pairs a chat from /start <token> by mapping to the primary thread", async () => {
    const supabase = createWebhookSupabase({
      mappingResults: [{ data: null, error: null }],
      pairingTokenResults: [{
        data: {
          token: "pair-token-123",
          client_id: "client-1",
          expires_at: "2099-03-20T20:10:00.000Z",
        },
        error: null,
      }],
      threadSelectResults: [{
        data: { thread_id: "primary-thread-1" },
        error: null,
      }],
      mappingInsertResults: [{ data: null, error: null }],
      tokenDeleteResults: [{ data: null, error: null }],
    });
    const api = createTelegramBotApi();
    mockCreateAdminClient.mockResolvedValue(supabase);
    mockCreateTelegramBot.mockReturnValue({ api });

    const response = await POST(
      createRequest({
        update_id: 99,
        message: {
          message_id: 1,
          text: "/start pair-token-123",
          chat: { id: 12345, type: "private" },
          from: { id: 7, is_bot: false, first_name: "Seth" },
        },
      }),
    );
    await flushBackgroundWork();

    expect(response.status).toBe(200);
    // Should NOT create a new thread — uses existing primary
    expect(
      supabase.records.inserts.some(
        (insert) => insert.table === "conversation_threads",
      ),
    ).toBe(false);
    // Should create a channel mapping
    expect(
      supabase.records.inserts.some(
        (insert) => insert.table === "conversation_channel_mappings",
      ),
    ).toBe(true);
    expect(api.sendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringMatching(/connected/i),
      expect.anything(),
    );
  });

  it("does not resolve approvals for callbacks from unpaired chats", async () => {
    const supabase = createWebhookSupabase({
      mappingResults: [{ data: null, error: null }],
    });
    const api = createTelegramBotApi();
    mockCreateAdminClient.mockResolvedValue(supabase);
    mockCreateTelegramBot.mockReturnValue({ api });

    const response = await POST(
      createRequest({
        update_id: 100,
        callback_query: {
          id: "callback-1",
          data: "approve:approval-1",
          message: {
            message_id: 8,
            text: "Approve this?",
            chat: { id: 12345, type: "private" },
          },
        },
      }),
    );
    await flushBackgroundWork();

    expect(response.status).toBe(200);
    expect(mockResolveApprovalById).not.toHaveBeenCalled();
    expect(api.answerCallbackQuery).toHaveBeenCalledWith("callback-1", {
      text: "Not connected.",
    });
  });

  it("returns an expired response for stale question callbacks", async () => {
    const supabase = createWebhookSupabase();
    const api = createTelegramBotApi();
    mockCreateAdminClient.mockResolvedValue(supabase);
    mockCreateTelegramBot.mockReturnValue({ api });
    mockAdvancePendingQuestionBatchByCallback.mockResolvedValueOnce({ status: "expired" });

    const response = await POST(
      createRequest({
        update_id: 101,
        callback_query: {
          id: "callback-2",
          data: "q:batch-1:0:1",
          message: {
            message_id: 8,
            text: "Which contact?",
            chat: { id: 12345, type: "private" },
          },
        },
      }),
    );
    await flushBackgroundWork();

    expect(response.status).toBe(200);
    expect(api.answerCallbackQuery).toHaveBeenCalledWith("callback-2", {
      text: "This question has expired.",
    });
  });

  it("edits approval callback messages after a successful resolution", async () => {
    const supabase = createWebhookSupabase({
      mappingResults: [{
        data: {
          client_id: "client-1",
          thread_id: "thread-2",
          external_conversation_id: "12345",
        },
        error: null,
      }],
    });
    const api = createTelegramBotApi();
    mockCreateAdminClient.mockResolvedValue(supabase);
    mockCreateTelegramBot.mockReturnValue({ api });

    const response = await POST(
      createRequest({
        update_id: 102,
        callback_query: {
          id: "callback-approval",
          data: "approve:approval-1",
          message: {
            message_id: 8,
            text: "Approval Required",
            chat: { id: 12345, type: "private" },
          },
        },
      }),
    );
    await flushBackgroundWork();

    expect(response.status).toBe(200);
    expect(api.editMessageText).toHaveBeenCalledWith(
      12345,
      8,
      expect.stringContaining("✅ Approved"),
      { reply_markup: { inline_keyboard: [] } },
    );
  });

  it("reports already-resolved approvals consistently in the callback toast", async () => {
    const supabase = createWebhookSupabase({
      mappingResults: [{
        data: {
          client_id: "client-1",
          thread_id: "thread-2",
          external_conversation_id: "12345",
        },
        error: null,
      }],
    });
    const api = createTelegramBotApi();
    mockCreateAdminClient.mockResolvedValue(supabase);
    mockCreateTelegramBot.mockReturnValue({ api });
    mockResolveApprovalById.mockResolvedValueOnce({
      success: true,
      status: "already_resolved",
      threadId: "thread-2",
    });

    const response = await POST(
      createRequest({
        update_id: 1021,
        callback_query: {
          id: "callback-approval-already",
          data: "approve:approval-1",
          message: {
            message_id: 81,
            text: "Approval Required",
            chat: { id: 12345, type: "private" },
          },
        },
      }),
    );
    await flushBackgroundWork();

    expect(response.status).toBe(200);
    expect(api.answerCallbackQuery).toHaveBeenCalledWith("callback-approval-already", {
      text: "Already resolved.",
    });
  });

  it("edits the selected question message before sending the next question", async () => {
    const supabase = createWebhookSupabase();
    const api = createTelegramBotApi();
    mockCreateAdminClient.mockResolvedValue(supabase);
    mockCreateTelegramBot.mockReturnValue({ api });
    mockAdvancePendingQuestionBatchByCallback.mockResolvedValueOnce({
      status: "next",
      batch: {
        token: "batch-1",
        clientId: "client-1",
        threadId: "thread-1",
        chatId: "12345",
        questions: [],
        answers: ["Mary"],
        currentIndex: 1,
        awaitingTextReply: false,
      },
      question: {
        question: "Why this contact?",
        options: ["Urgent", "Important"],
        type: "single_select",
      },
      questionIndex: 1,
      rollback: {
        token: "batch-1",
        expectedCurrentIndex: 1,
        restoreCurrentIndex: 0,
        restoreAwaitingTextReply: false,
        answers: ["Mary"],
      },
      selectedOption: "Mary",
    });

    const response = await POST(
      createRequest({
        update_id: 103,
        callback_query: {
          id: "callback-question",
          data: "q:batch-1:0:1",
          message: {
            message_id: 9,
            text: "Which contact?",
            chat: { id: 12345, type: "private" },
          },
        },
      }),
    );
    await flushBackgroundWork();

    expect(response.status).toBe(200);
    expect(api.editMessageText).toHaveBeenCalledWith(
      12345,
      9,
      expect.stringContaining("✅ Selected: Mary"),
      { reply_markup: { inline_keyboard: [] } },
    );
    expect(api.sendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining("Why this contact?"),
      expect.anything(),
    );
  });

  it("restores pending question state when sending the next question fails", async () => {
    const supabase = createWebhookSupabase();
    const api = createTelegramBotApi();
    api.sendMessage.mockRejectedValueOnce(new Error("telegram send failed"));
    mockCreateAdminClient.mockResolvedValue(supabase);
    mockCreateTelegramBot.mockReturnValue({ api });
    mockAdvancePendingQuestionBatchByCallback.mockResolvedValueOnce({
      status: "next",
      batch: {
        token: "batch-1",
        clientId: "client-1",
        threadId: "thread-1",
        chatId: "12345",
        questions: [],
        answers: ["Mary"],
        currentIndex: 1,
        awaitingTextReply: false,
      },
      question: {
        question: "Why this contact?",
        options: ["Urgent", "Important"],
        type: "single_select",
      },
      questionIndex: 1,
      rollback: {
        token: "batch-1",
        expectedCurrentIndex: 1,
        restoreCurrentIndex: 0,
        restoreAwaitingTextReply: false,
        answers: ["Mary"],
      },
      selectedOption: "Mary",
    });

    const response = await POST(
      createRequest({
        update_id: 104,
        callback_query: {
          id: "callback-question-fail",
          data: "q:batch-1:0:1",
          message: {
            message_id: 10,
            text: "Which contact?",
            chat: { id: 12345, type: "private" },
          },
        },
      }),
    );
    await flushBackgroundWork();

    expect(response.status).toBe(200);
    expect(mockRestorePendingQuestionBatch).toHaveBeenCalledWith(supabase, {
      token: "batch-1",
      expectedCurrentIndex: 1,
      restoreCurrentIndex: 0,
      restoreAwaitingTextReply: false,
      answers: ["Mary"],
    });
    expect(api.editMessageText).not.toHaveBeenCalled();
  });

  it("handles /new by clearing pending questions and moving the mapping to a fresh thread", async () => {
    const supabase = createWebhookSupabase({
      mappingResults: [{
        data: {
          client_id: "client-1",
          thread_id: "thread-1",
          external_conversation_id: "12345",
        },
        error: null,
      }],
      threadInsertResults: [{ data: null, error: null }],
      mappingUpdateResults: [{ data: null, error: null }],
    });
    const api = createTelegramBotApi();
    mockCreateAdminClient.mockResolvedValue(supabase);
    mockCreateTelegramBot.mockReturnValue({ api });

    const response = await POST(
      createRequest({
        update_id: 200,
        message: {
          message_id: 2,
          text: "/new",
          chat: { id: 12345, type: "private" },
          from: { id: 7, is_bot: false, first_name: "Seth" },
        },
      }),
    );
    await flushBackgroundWork();

    expect(response.status).toBe(200);
    expect(mockClearPendingQuestionsForChat).toHaveBeenCalledWith(supabase, "12345");
    expect(
      supabase.records.inserts.some((insert) => insert.table === "conversation_threads"),
    ).toBe(true);
    expect(api.sendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringMatching(/started a new telegram chat/i),
      expect.anything(),
    );
  });

  it("does not move the mapping when clearing pending questions fails during /new", async () => {
    const supabase = createWebhookSupabase({
      mappingResults: [{
        data: {
          client_id: "client-1",
          thread_id: "thread-1",
          external_conversation_id: "12345",
        },
        error: null,
      }],
    });
    const api = createTelegramBotApi();
    mockCreateAdminClient.mockResolvedValue(supabase);
    mockCreateTelegramBot.mockReturnValue({ api });
    mockClearPendingQuestionsForChat.mockRejectedValueOnce(new Error("clear failed"));

    const response = await POST(
      createRequest({
        update_id: 2001,
        message: {
          message_id: 20,
          text: "/new",
          chat: { id: 12345, type: "private" },
          from: { id: 7, is_bot: false, first_name: "Seth" },
        },
      }),
    );
    await flushBackgroundWork();

    expect(response.status).toBe(200);
    expect(
      supabase.records.inserts.some((insert) => insert.table === "conversation_threads"),
    ).toBe(false);
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it("uses the completed pending text reply instead of the raw Telegram text", async () => {
    const supabase = createWebhookSupabase({
      mappingResults: [{
        data: {
          client_id: "client-1",
          thread_id: "thread-1",
          external_conversation_id: "12345",
        },
        error: null,
      }],
      receiptInsertResults: [{ data: null, error: null }],
    });
    const api = createTelegramBotApi();
    mockCreateAdminClient.mockResolvedValue(supabase);
    mockCreateTelegramBot.mockReturnValue({ api });
    mockAdvancePendingQuestionBatchByTextReply.mockResolvedValueOnce({
      status: "completed",
      clientId: "client-1",
      threadId: "thread-1",
      responseText: "Q: Which contact?\nA: John",
      selectedOption: "John",
    });

    const response = await POST(
      createRequest({
        update_id: 201,
        message: {
          message_id: 3,
          text: "John",
          chat: { id: 12345, type: "private" },
          from: { id: 7, is_bot: false, first_name: "Seth" },
        },
      }),
    );
    await flushBackgroundWork();

    expect(response.status).toBe(200);
    expect(mockRunManagedAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        input: "Q: Which contact?\nA: John",
      }),
    );
  });

  it("restores pending text-reply state when sending the next prompt fails", async () => {
    const supabase = createWebhookSupabase({
      mappingResults: [{
        data: {
          client_id: "client-1",
          thread_id: "thread-1",
          external_conversation_id: "12345",
        },
        error: null,
      }],
      receiptInsertResults: [{ data: null, error: null }],
    });
    const api = createTelegramBotApi();
    api.sendMessage.mockRejectedValueOnce(new Error("telegram send failed"));
    mockCreateAdminClient.mockResolvedValue(supabase);
    mockCreateTelegramBot.mockReturnValue({ api });
    mockAdvancePendingQuestionBatchByTextReply.mockResolvedValueOnce({
      status: "next",
      batch: {
        token: "batch-2",
        clientId: "client-1",
        threadId: "thread-1",
        chatId: "12345",
        questions: [],
        answers: ["John and Mary"],
        currentIndex: 1,
        awaitingTextReply: false,
      },
      question: {
        question: "Why?",
        options: ["Urgent", "Important"],
        type: "single_select",
      },
      questionIndex: 1,
      rollback: {
        token: "batch-2",
        expectedCurrentIndex: 1,
        restoreCurrentIndex: 0,
        restoreAwaitingTextReply: true,
        answers: ["John and Mary"],
      },
      selectedOption: "John and Mary",
    });

    const response = await POST(
      createRequest({
        update_id: 2011,
        message: {
          message_id: 31,
          text: "John and Mary",
          chat: { id: 12345, type: "private" },
          from: { id: 7, is_bot: false, first_name: "Seth" },
        },
      }),
    );
    await flushBackgroundWork();

    expect(response.status).toBe(200);
    expect(mockRestorePendingQuestionBatch).toHaveBeenCalledWith(supabase, {
      token: "batch-2",
      expectedCurrentIndex: 1,
      restoreCurrentIndex: 0,
      restoreAwaitingTextReply: true,
      answers: ["John and Mary"],
    });
    expect(mockRunManagedAgent).not.toHaveBeenCalledWith(
      expect.objectContaining({ input: "John and Mary" }),
    );
  });

  it("switches mapping back to primary thread on /main", async () => {
    const supabase = createWebhookSupabase({
      mappingResults: [{
        data: {
          client_id: "client-1",
          thread_id: "task-thread-1",
          external_conversation_id: "12345",
        },
        error: null,
      }],
      threadSelectResults: [{
        data: { thread_id: "primary-thread-1" },
        error: null,
      }],
      mappingUpdateResults: [{ data: null, error: null }],
    });
    const api = createTelegramBotApi();
    mockCreateAdminClient.mockResolvedValue(supabase);
    mockCreateTelegramBot.mockReturnValue({ api });

    const response = await POST(
      createRequest({
        update_id: 300,
        message: {
          message_id: 5,
          text: "/main",
          chat: { id: 12345, type: "private" },
          from: { id: 7, is_bot: false, first_name: "Seth" },
        },
      }),
    );
    await flushBackgroundWork();

    expect(response.status).toBe(200);
    expect(mockClearPendingQuestionsForChat).toHaveBeenCalledWith(supabase, "12345");
    expect(api.sendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringMatching(/main session/i),
      expect.anything(),
    );
  });

  it("reports already in main session when /main issued on primary thread", async () => {
    const supabase = createWebhookSupabase({
      mappingResults: [{
        data: {
          client_id: "client-1",
          thread_id: "primary-thread-1",
          external_conversation_id: "12345",
        },
        error: null,
      }],
      threadSelectResults: [{
        data: { thread_id: "primary-thread-1" },
        error: null,
      }],
    });
    const api = createTelegramBotApi();
    mockCreateAdminClient.mockResolvedValue(supabase);
    mockCreateTelegramBot.mockReturnValue({ api });

    const response = await POST(
      createRequest({
        update_id: 301,
        message: {
          message_id: 6,
          text: "/main",
          chat: { id: 12345, type: "private" },
          from: { id: 7, is_bot: false, first_name: "Seth" },
        },
      }),
    );
    await flushBackgroundWork();

    expect(response.status).toBe(200);
    expect(api.sendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringMatching(/already in the main session/i),
      expect.anything(),
    );
    // Bug fix: should NOT clear pending questions when already on main
    expect(mockClearPendingQuestionsForChat).not.toHaveBeenCalled();
  });

  it("warns about stale approvals when the approval thread differs from the current mapping", async () => {
    const supabase = createWebhookSupabase({
      mappingResults: [{
        data: {
          client_id: "client-1",
          thread_id: "new-thread-after-switch",
          external_conversation_id: "12345",
        },
        error: null,
      }],
    });
    const api = createTelegramBotApi();
    mockCreateAdminClient.mockResolvedValue(supabase);
    mockCreateTelegramBot.mockReturnValue({ api });

    const response = await POST(
      createRequest({
        update_id: 302,
        callback_query: {
          id: "callback-stale",
          data: "approve:approval-stale",
          message: {
            message_id: 11,
            text: "Approval Required",
            chat: { id: 12345, type: "private" },
          },
        },
      }),
    );
    await flushBackgroundWork();

    expect(response.status).toBe(200);
    expect(mockResolveApprovalById).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        clientId: "client-1",
        approvalId: "approval-stale",
        approved: true,
      }),
    );
    expect(api.answerCallbackQuery).toHaveBeenCalledWith("callback-stale", {
      text: "Approved — response in web app (session changed)",
    });
  });

  it("passes stored Telegram media through as runner file parts", async () => {
    const supabase = createWebhookSupabase({
      mappingResults: [{
        data: {
          client_id: "client-1",
          thread_id: "thread-1",
          external_conversation_id: "12345",
        },
        error: null,
      }],
      receiptInsertResults: [{ data: null, error: null }],
    });
    const api = createTelegramBotApi();
    mockCreateAdminClient.mockResolvedValue(supabase);
    mockCreateTelegramBot.mockReturnValue({ api });
    mockDownloadAndStoreTelegramFile.mockResolvedValueOnce({
      url: "https://storage.example.com/agent-files/client-1/uploads/telegram/photo.jpg?token=signed",
      mimeType: "image/jpeg",
      storagePath: "uploads/telegram/photo.jpg",
    });

    const response = await POST(
      createRequest({
        update_id: 202,
        message: {
          message_id: 4,
          photo: [
            { file_id: "photo-small", width: 100, height: 100 },
            { file_id: "photo-large", width: 1000, height: 1000 },
          ],
          chat: { id: 12345, type: "private" },
          from: { id: 7, is_bot: false, first_name: "Seth" },
        },
      }),
    );
    await flushBackgroundWork();

    expect(response.status).toBe(200);
    expect(mockGetOrCreateSession).toHaveBeenCalledWith({
      anthropic: { beta: {} },
      supabase,
      threadId: "thread-1",
      threadTitle: null,
    });
    expect(mockAttachFileToSession).toHaveBeenCalledTimes(1);
    expect(mockAttachFileToSession.mock.calls[0]?.[0]).toMatchObject({
      sessionId: "session-1",
      filename: "upload",
    });
    expect(mockRunManagedAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        input: "",
      }),
    );
  });
});
