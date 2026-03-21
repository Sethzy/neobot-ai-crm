/**
 * Tests for Telegram pending-question helpers.
 * @module lib/channels/telegram/pending-questions.test
 */
import { describe, expect, it } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import {
  advancePendingQuestionBatchByCallback,
  advancePendingQuestionBatchByTextReply,
  clearPendingQuestionsForChat,
  generateQuestionCallbackToken,
  persistPendingQuestionBatch,
} from "./pending-questions";

describe("generateQuestionCallbackToken", () => {
  it("returns a base64url-safe token", () => {
    expect(generateQuestionCallbackToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("stays short enough for Telegram callback_data", () => {
    expect(generateQuestionCallbackToken().length).toBeLessThan(30);
  });

  it("generates unique values", () => {
    expect(generateQuestionCallbackToken()).not.toBe(generateQuestionCallbackToken());
  });
});

describe("persistPendingQuestionBatch", () => {
  it("stores a new batch with the first question's reply mode", async () => {
    const supabase = createMockSupabaseClient({
      insertResult: { data: null, error: null },
    });

    const batch = await persistPendingQuestionBatch(supabase as never, {
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      chatId: "12345",
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
    });

    expect(batch.currentIndex).toBe(0);
    expect(batch.awaitingTextReply).toBe(false);
    expect(batch.answers).toEqual([]);
    expect(supabase.calls.from).toContain("telegram_pending_questions");
    expect(supabase.calls.methods).toContainEqual({
      method: "insert",
      args: [
        expect.objectContaining({
          client_id: "550e8400-e29b-41d4-a716-446655440000",
          thread_id: "660e8400-e29b-41d4-a716-446655440000",
          chat_id: "12345",
          current_index: 0,
          awaiting_text_reply: false,
        }),
      ],
    });
  });
});

describe("advancePendingQuestionBatchByCallback", () => {
  it("advances to the next question without continuing the agent yet", async () => {
    const questions = [
      { question: "Which contact?", options: ["John", "Mary"], type: "single_select" as const },
      { question: "Why?", options: ["Urgent", "Important"], type: "multi_select" as const },
    ];
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [{
          token: "batch-1",
          client_id: "client-1",
          thread_id: "thread-1",
          chat_id: "12345",
          questions,
          answers: [],
          current_index: 0,
          awaiting_text_reply: false,
        }],
        error: null,
      },
      updateResult: {
        data: {
          token: "batch-1",
          client_id: "client-1",
          thread_id: "thread-1",
          chat_id: "12345",
          questions,
          answers: ["Mary"],
          current_index: 1,
          awaiting_text_reply: true,
        },
        error: null,
      },
    });

    const result = await advancePendingQuestionBatchByCallback(supabase as never, {
      token: "batch-1",
      questionIndex: 0,
      optionIndex: 1,
    });

    expect(result).toEqual({
      status: "next",
      batch: expect.objectContaining({
        token: "batch-1",
        currentIndex: 1,
        awaitingTextReply: true,
        answers: ["Mary"],
      }),
      question: questions[1],
      questionIndex: 1,
      selectedOption: "Mary",
    });
  });

  it("returns completed with formatted Q/A text for the final answer", async () => {
    const questions = [
      { question: "Which contact?", options: ["John", "Mary"], type: "single_select" as const },
    ];
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [{
          token: "batch-1",
          client_id: "client-1",
          thread_id: "thread-1",
          chat_id: "12345",
          questions,
          answers: [],
          current_index: 0,
          awaiting_text_reply: false,
        }],
        error: null,
      },
      deleteResult: { data: null, error: null },
    });

    const result = await advancePendingQuestionBatchByCallback(supabase as never, {
      token: "batch-1",
      questionIndex: 0,
      optionIndex: 0,
    });

    expect(result).toEqual({
      status: "completed",
      clientId: "client-1",
      threadId: "thread-1",
      responseText: "Q: Which contact?\nA: John",
      selectedOption: "John",
    });
  });

  it("rejects stale callbacks that do not match the current question index", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [{
          token: "batch-1",
          client_id: "client-1",
          thread_id: "thread-1",
          chat_id: "12345",
          questions: [
            { question: "Why?", options: ["Urgent", "Important"], type: "single_select" },
          ],
          answers: [],
          current_index: 1,
          awaiting_text_reply: false,
        }],
        error: null,
      },
    });

    const result = await advancePendingQuestionBatchByCallback(supabase as never, {
      token: "batch-1",
      questionIndex: 0,
      optionIndex: 0,
    });

    expect(result).toEqual({ status: "expired" });
  });
});

describe("advancePendingQuestionBatchByTextReply", () => {
  it("completes a pending text reply batch and formats the full response", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [{
          token: "batch-1",
          client_id: "client-1",
          thread_id: "thread-1",
          chat_id: "12345",
          questions: [
            { question: "Which contacts?", options: ["John", "Mary"], type: "multi_select" },
          ],
          answers: [],
          current_index: 0,
          awaiting_text_reply: true,
        }],
        error: null,
      },
      deleteResult: { data: null, error: null },
    });

    const result = await advancePendingQuestionBatchByTextReply(supabase as never, {
      chatId: "12345",
      text: "John and Mary",
    });

    expect(result).toEqual({
      status: "completed",
      clientId: "client-1",
      threadId: "thread-1",
      responseText: "Q: Which contacts?\nA: John and Mary",
      selectedOption: "John and Mary",
    });
  });
});

describe("clearPendingQuestionsForChat", () => {
  it("deletes every pending question batch for a chat", async () => {
    const supabase = createMockSupabaseClient({
      deleteResult: { data: null, error: null },
    });

    await clearPendingQuestionsForChat(supabase as never, "12345");

    expect(supabase.calls.methods).toContainEqual({
      method: "delete",
      args: [],
    });
    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["chat_id", "12345"],
    });
  });
});
