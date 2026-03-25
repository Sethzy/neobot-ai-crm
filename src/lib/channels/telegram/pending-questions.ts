/**
 * Persisted Telegram pending-question batch helpers.
 * Stores the full ask_user_question batch so Telegram can advance one question
 * at a time and only continue the agent once the whole batch is answered.
 * @module lib/channels/telegram/pending-questions
 */
import { randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database";

import {
  formatQuestionResponse,
  isSupportedQuestionType,
} from "./questions";

type TelegramPendingQuestionsClient = SupabaseClient<Database>;
type PendingQuestionRow = Database["public"]["Tables"]["telegram_pending_questions"]["Row"];
type PendingQuestionInsert =
  Database["public"]["Tables"]["telegram_pending_questions"]["Insert"];
type PendingQuestionSelectedRow = Pick<
  PendingQuestionRow,
  | "token"
  | "client_id"
  | "thread_id"
  | "chat_id"
  | "questions"
  | "answers"
  | "current_index"
  | "awaiting_text_reply"
>;

const pendingQuestionSelectColumns = [
  "token",
  "client_id",
  "thread_id",
  "chat_id",
  "questions",
  "answers",
  "current_index",
  "awaiting_text_reply",
].join(", ");

export interface TelegramPendingQuestion {
  question: string;
  options: string[];
  type: "single_select" | "multi_select" | "rank_priorities";
}

export interface PendingQuestionBatch {
  token: string;
  clientId: string;
  threadId: string;
  chatId: string;
  questions: TelegramPendingQuestion[];
  answers: string[];
  currentIndex: number;
  awaitingTextReply: boolean;
}

export interface PersistPendingQuestionBatchInput {
  clientId: string;
  threadId: string;
  chatId: string;
  questions: TelegramPendingQuestion[];
}

export interface PendingQuestionRollbackState {
  token: string;
  expectedCurrentIndex: number;
  restoreCurrentIndex: number;
  restoreAwaitingTextReply: boolean;
  answers: string[];
}

type PendingQuestionAdvanceResult =
  | { status: "expired" }
  | {
    status: "next";
    batch: PendingQuestionBatch;
    question: TelegramPendingQuestion;
    questionIndex: number;
    rollback: PendingQuestionRollbackState;
    selectedOption: string;
  }
  | {
    status: "completed";
    clientId: string;
    threadId: string;
    responseText: string;
    selectedOption: string;
  };

/** Generates a short opaque callback token that fits comfortably in Telegram callback_data. */
export function generateQuestionCallbackToken(): string {
  return randomBytes(8).toString("base64url");
}

function normalizeQuestions(value: Json): TelegramPendingQuestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const question = typeof record.question === "string" ? record.question : null;
    const type = typeof record.type === "string" ? record.type : null;
    const options = Array.isArray(record.options)
      ? record.options.filter((option): option is string => typeof option === "string")
      : [];

    if (
      !question ||
      (type !== "single_select" && type !== "multi_select" && type !== "rank_priorities")
    ) {
      return [];
    }

    return [{ question, options, type }];
  });
}

function normalizeAnswers(value: Json): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((answer): answer is string => typeof answer === "string");
}

function mapPendingQuestionRow(row: PendingQuestionSelectedRow): PendingQuestionBatch {
  return {
    token: row.token,
    clientId: row.client_id,
    threadId: row.thread_id,
    chatId: row.chat_id,
    questions: normalizeQuestions(row.questions),
    answers: normalizeAnswers(row.answers),
    currentIndex: row.current_index,
    awaitingTextReply: row.awaiting_text_reply,
  };
}

function buildBatchInsertRow(
  token: string,
  input: PersistPendingQuestionBatchInput,
): PendingQuestionInsert {
  const firstQuestion = input.questions[0];

  return {
    token,
    client_id: input.clientId,
    thread_id: input.threadId,
    chat_id: input.chatId,
    questions: input.questions as unknown as Json,
    answers: [] as Json,
    current_index: 0,
    awaiting_text_reply: firstQuestion ? !isSupportedQuestionType(firstQuestion.type) : false,
  };
}

function buildBatchResponse(
  batch: PendingQuestionBatch,
  answers: string[],
): string {
  return formatQuestionResponse(
    batch.questions.map((question, index) => ({
      question: question.question,
      selectedOption: answers[index] ?? "",
    })),
  );
}

async function loadBatchByToken(
  supabase: TelegramPendingQuestionsClient,
  token: string,
): Promise<PendingQuestionBatch | null> {
  const { data, error } = await supabase
    .from("telegram_pending_questions")
    .select(pendingQuestionSelectColumns)
    .eq("token", token)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapPendingQuestionRow(data as unknown as PendingQuestionSelectedRow);
}

async function loadBatchAwaitingTextReply(
  supabase: TelegramPendingQuestionsClient,
  chatId: string,
): Promise<PendingQuestionBatch | null> {
  const { data, error } = await supabase
    .from("telegram_pending_questions")
    .select(pendingQuestionSelectColumns)
    .eq("chat_id", chatId)
    .eq("awaiting_text_reply", true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapPendingQuestionRow(data as unknown as PendingQuestionSelectedRow);
}

/** Inserts a new pending-question batch and returns the stored batch metadata. */
export async function persistPendingQuestionBatch(
  supabase: TelegramPendingQuestionsClient,
  input: PersistPendingQuestionBatchInput,
): Promise<PendingQuestionBatch> {
  const token = generateQuestionCallbackToken();
  const insertRow = buildBatchInsertRow(token, input);
  const { error } = await supabase
    .from("telegram_pending_questions")
    .insert(insertRow);

  if (error) {
    throw error;
  }

  return {
    token,
    clientId: input.clientId,
    threadId: input.threadId,
    chatId: input.chatId,
    questions: input.questions,
    answers: [],
    currentIndex: 0,
    awaitingTextReply: insertRow.awaiting_text_reply ?? false,
  };
}

/** Deletes one persisted pending-question batch by token. */
export async function deletePendingQuestionBatch(
  supabase: TelegramPendingQuestionsClient,
  token: string,
): Promise<void> {
  const { error } = await supabase
    .from("telegram_pending_questions")
    .delete()
    .eq("token", token);

  if (error) {
    throw error;
  }
}

/** Restores a batch cursor when sending the next Telegram question fails. */
export async function restorePendingQuestionBatch(
  supabase: TelegramPendingQuestionsClient,
  rollback: PendingQuestionRollbackState,
): Promise<void> {
  const { error } = await supabase
    .from("telegram_pending_questions")
    .update({
      answers: rollback.answers as unknown as Json,
      current_index: rollback.restoreCurrentIndex,
      awaiting_text_reply: rollback.restoreAwaitingTextReply,
    })
    .eq("token", rollback.token)
    .eq("current_index", rollback.expectedCurrentIndex);

  if (error) {
    throw error;
  }
}

/** Shared advance logic once the batch and selected answer are resolved. */
async function advanceBatch(
  supabase: TelegramPendingQuestionsClient,
  batch: PendingQuestionBatch,
  selectedOption: string,
): Promise<PendingQuestionAdvanceResult> {
  const nextAnswers = [...batch.answers];
  nextAnswers[batch.currentIndex] = selectedOption;

  if (batch.currentIndex >= batch.questions.length - 1) {
    const { error } = await supabase
      .from("telegram_pending_questions")
      .delete()
      .eq("token", batch.token)
      .eq("current_index", batch.currentIndex);

    if (error) {
      return { status: "expired" };
    }

    return {
      status: "completed",
      clientId: batch.clientId,
      threadId: batch.threadId,
      responseText: buildBatchResponse(batch, nextAnswers),
      selectedOption,
    };
  }

  const nextQuestionIndex = batch.currentIndex + 1;
  const nextQuestion = batch.questions[nextQuestionIndex];
  if (!nextQuestion) {
    return { status: "expired" };
  }

  const { data, error } = await supabase
    .from("telegram_pending_questions")
    .update({
      answers: nextAnswers as unknown as Json,
      current_index: nextQuestionIndex,
      awaiting_text_reply: !isSupportedQuestionType(nextQuestion.type),
    })
    .eq("token", batch.token)
    .eq("current_index", batch.currentIndex)
    .select(pendingQuestionSelectColumns)
    .maybeSingle();

  if (error || !data) {
    return { status: "expired" };
  }

  return {
    status: "next",
    batch: mapPendingQuestionRow(data as unknown as PendingQuestionSelectedRow),
    question: nextQuestion,
    questionIndex: nextQuestionIndex,
    rollback: {
      token: batch.token,
      expectedCurrentIndex: nextQuestionIndex,
      restoreCurrentIndex: batch.currentIndex,
      restoreAwaitingTextReply: batch.awaitingTextReply,
      answers: nextAnswers,
    },
    selectedOption,
  };
}

/** Advances a pending batch from one inline-button answer. */
export async function advancePendingQuestionBatchByCallback(
  supabase: TelegramPendingQuestionsClient,
  input: { token: string; questionIndex: number; optionIndex: number },
): Promise<PendingQuestionAdvanceResult> {
  const batch = await loadBatchByToken(supabase, input.token);

  if (!batch || batch.currentIndex !== input.questionIndex) {
    return { status: "expired" };
  }

  const currentQuestion = batch.questions[batch.currentIndex];
  if (!currentQuestion) {
    return { status: "expired" };
  }

  const selectedOption = currentQuestion.options[input.optionIndex];
  if (!selectedOption) {
    return { status: "expired" };
  }

  return advanceBatch(supabase, batch, selectedOption);
}

/** Advances a pending batch from the next free-text reply for one chat. */
export async function advancePendingQuestionBatchByTextReply(
  supabase: TelegramPendingQuestionsClient,
  input: { chatId: string; text: string },
): Promise<PendingQuestionAdvanceResult> {
  const trimmedText = input.text.trim();
  if (!trimmedText) {
    return { status: "expired" };
  }

  const batch = await loadBatchAwaitingTextReply(supabase, input.chatId);
  if (!batch) {
    return { status: "expired" };
  }

  const currentQuestion = batch.questions[batch.currentIndex];
  if (!currentQuestion) {
    return { status: "expired" };
  }

  return advanceBatch(supabase, batch, trimmedText);
}

/** Clears every pending-question batch for one Telegram chat. */
export async function clearPendingQuestionsForChat(
  supabase: TelegramPendingQuestionsClient,
  chatId: string,
): Promise<void> {
  const { error } = await supabase
    .from("telegram_pending_questions")
    .delete()
    .eq("chat_id", chatId);

  if (error) {
    throw error;
  }
}
