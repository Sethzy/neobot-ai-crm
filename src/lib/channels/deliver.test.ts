/**
 * Tests for shared external channel delivery helpers.
 * @module lib/channels/deliver.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import {
  deliverToExternalChannels,
  hasExternalDeliverables,
} from "./deliver";

vi.mock("@/lib/channels/telegram", () => ({
  getTelegramBotToken: vi.fn(() => "test-token"),
  createTelegramBot: vi.fn(() => ({ api: {} })),
  sendTelegramMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
  sendTelegramApprovalRequest: vi.fn().mockResolvedValue(undefined),
  sendTelegramQuestion: vi.fn().mockResolvedValue(undefined),
  buildUnsupportedQuestionFallback: vi.fn((question: string) => `fallback:${question}`),
}));

vi.mock("@/lib/channels/telegram/pending-questions", () => ({
  persistPendingQuestionBatch: vi.fn().mockResolvedValue({
    token: "batch-1",
    clientId: "client-1",
    threadId: "thread-1",
    chatId: "12345",
    questions: [],
    answers: [],
    currentIndex: 0,
    awaitingTextReply: false,
  }),
  deletePendingQuestionBatch: vi.fn().mockResolvedValue(undefined),
}));

describe("hasExternalDeliverables", () => {
  it("returns true for plain assistant text", () => {
    expect(hasExternalDeliverables("hello")).toBe(true);
  });

  it("returns true for ask_user_question output without assistant prose", () => {
    expect(hasExternalDeliverables("", [
      {
        type: "tool-ask_user_question",
        state: "output-available",
        output: { status: "awaiting_response", questions: [] },
      } as never,
    ])).toBe(true);
  });

  it("returns false when neither text nor deliverable parts exist", () => {
    expect(hasExternalDeliverables("   ", [])).toBe(false);
  });
});

describe("deliverToExternalChannels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends text replies to telegram mappings", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [{ channel: "telegram", external_conversation_id: "12345" }],
        error: null,
      },
    });
    const { sendTelegramMessage } = await import("@/lib/channels/telegram");

    await deliverToExternalChannels(
      supabase as never,
      "thread-1",
      "client-1",
      "Hello from agent",
    );

    expect(sendTelegramMessage).toHaveBeenCalledWith(
      expect.anything(),
      "12345",
      "Hello from agent",
    );
  });

  it("sends approval requests through the shared telegram delivery path", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [{ channel: "telegram", external_conversation_id: "12345" }],
        error: null,
      },
    });
    const { sendTelegramApprovalRequest } = await import("@/lib/channels/telegram");

    await deliverToExternalChannels(
      supabase as never,
      "thread-1",
      "client-1",
      "",
      [{
        type: "tool-delete_contact",
        state: "approval-requested",
        input: { contactId: "123" },
        approval: { id: "approval-1" },
      } as never],
    );

    expect(sendTelegramApprovalRequest).toHaveBeenCalledWith(
      expect.anything(),
      "12345",
      "approval-1",
      "delete_contact",
      { contactId: "123" },
    );
  });

  it("persists a question batch and sends the first supported question", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [{ channel: "telegram", external_conversation_id: "12345" }],
        error: null,
      },
    });
    const { persistPendingQuestionBatch } = await import(
      "@/lib/channels/telegram/pending-questions"
    );
    const { sendTelegramQuestion } = await import("@/lib/channels/telegram");

    await deliverToExternalChannels(
      supabase as never,
      "thread-1",
      "client-1",
      "",
      [{
        type: "tool-ask_user_question",
        state: "output-available",
        output: {
          status: "awaiting_response",
          questions: [
            {
              question: "Which contact?",
              options: ["John", "Mary"],
              type: "single_select",
            },
            {
              question: "Why?",
              options: ["Urgent", "Important"],
              type: "multi_select",
            },
          ],
        },
      } as never],
    );

    expect(persistPendingQuestionBatch).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        clientId: "client-1",
        threadId: "thread-1",
        chatId: "12345",
      }),
    );
    expect(sendTelegramQuestion).toHaveBeenCalledWith(
      expect.anything(),
      "12345",
      "batch-1",
      0,
      "Which contact?",
      ["John", "Mary"],
    );
  });

  it("falls back to prose for unsupported first-question types", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [{ channel: "telegram", external_conversation_id: "12345" }],
        error: null,
      },
    });
    const { sendTelegramMessage } = await import("@/lib/channels/telegram");

    await deliverToExternalChannels(
      supabase as never,
      "thread-1",
      "client-1",
      "",
      [{
        type: "tool-ask_user_question",
        state: "output-available",
        output: {
          status: "awaiting_response",
          questions: [
            {
              question: "Which contacts?",
              options: ["John", "Mary"],
              type: "multi_select",
            },
          ],
        },
      } as never],
    );

    expect(sendTelegramMessage).toHaveBeenCalledWith(
      expect.anything(),
      "12345",
      "fallback:Which contacts?",
    );
  });

  it("cleans up the pending batch if sending the first Telegram question fails", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [{ channel: "telegram", external_conversation_id: "12345" }],
        error: null,
      },
    });
    const { deletePendingQuestionBatch } = await import(
      "@/lib/channels/telegram/pending-questions"
    );
    const { sendTelegramQuestion } = await import("@/lib/channels/telegram");
    vi.mocked(sendTelegramQuestion).mockRejectedValueOnce(new Error("telegram send failed"));

    await deliverToExternalChannels(
      supabase as never,
      "thread-1",
      "client-1",
      "",
      [{
        type: "tool-ask_user_question",
        state: "output-available",
        output: {
          status: "awaiting_response",
          questions: [
            {
              question: "Which contact?",
              options: ["John", "Mary"],
              type: "single_select",
            },
          ],
        },
      } as never],
    );

    expect(deletePendingQuestionBatch).toHaveBeenCalledWith(supabase, "batch-1");
  });
});
