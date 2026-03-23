/**
 * Telegram webhook ingress.
 * Handles pairing, inbound messages, approvals, and ask_user_question callbacks.
 * @module app/api/webhook/telegram/route
 */
import { randomUUID, timingSafeEqual } from "node:crypto";

import { after } from "next/server";
import { z } from "zod";

import { resolveAndContinueApproval } from "@/lib/approvals/continue-after-approval";
import {
  buildUnsupportedQuestionFallback,
  createTelegramBot,
  downloadAndStoreTelegramFile,
  getMediaFallbacks,
  getTelegramBotToken,
  isPairingTokenFormat,
  parseApprovalCallback,
  parseQuestionCallback,
  resolveFileId,
  sendTelegramQuestion,
} from "@/lib/channels/telegram";
import {
  advancePendingQuestionBatchByCallback,
  advancePendingQuestionBatchByTextReply,
  clearPendingQuestionsForChat,
  restorePendingQuestionBatch,
} from "@/lib/channels/telegram/pending-questions";
import { runAgent } from "@/lib/runner/run-agent";
import { createAdminClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

const telegramUpdateSchema = z.object({
  update_id: z.number().int(),
  message: z.record(z.string(), z.unknown()).optional(),
  callback_query: z.record(z.string(), z.unknown()).optional(),
});

type TelegramAdminClient = Awaited<ReturnType<typeof createAdminClient>>;
type TelegramBot = ReturnType<typeof createTelegramBot>;

function getTelegramWebhookSecret(): string {
  const secret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
  if (!secret) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET is required.");
  }
  return secret;
}

function hasValidTelegramSecret(headerValue: string | null): boolean {
  const expected = getTelegramWebhookSecret();
  const receivedBuffer = Buffer.from(headerValue ?? "");
  const expectedBuffer = Buffer.from(expected);

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

function isDuplicateInsertError(error: { code?: string; message?: string } | null): boolean {
  if (!error) {
    return false;
  }

  if (error.code === "23505") {
    return true;
  }

  return error.message?.toLowerCase().includes("duplicate") ?? false;
}

async function getTelegramMappingByChatId(
  supabase: TelegramAdminClient,
  chatId: string,
) {
  const { data, error } = await supabase
    .from("conversation_channel_mappings")
    .select("client_id, thread_id, external_conversation_id")
    .eq("channel", "telegram")
    .eq("external_conversation_id", chatId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function recordTelegramDeliveryReceipt(
  supabase: TelegramAdminClient,
  input: { clientId: string; threadId: string; updateId: number },
): Promise<boolean> {
  const { error } = await supabase
    .from("conversation_channel_delivery_receipts")
    .insert({
      client_id: input.clientId,
      thread_id: input.threadId,
      channel: "telegram",
      delivery_id: String(input.updateId),
    });

  if (isDuplicateInsertError(error)) {
    return false;
  }

  if (error) {
    throw error;
  }

  return true;
}

async function sendPlainTelegramMessage(
  bot: TelegramBot,
  chatId: number,
  text: string,
) {
  await bot.api.sendMessage(chatId, text, { parse_mode: "HTML" });
}

function getCallbackMessage(
  callbackQuery: Record<string, unknown>,
): Record<string, unknown> | null {
  const message = callbackQuery.message;
  return typeof message === "object" && message !== null
    ? message as Record<string, unknown>
    : null;
}

function getCallbackMessageText(message: Record<string, unknown>): string {
  if (typeof message.text === "string" && message.text.trim().length > 0) {
    return message.text;
  }

  if (typeof message.caption === "string" && message.caption.trim().length > 0) {
    return message.caption;
  }

  return "";
}

async function editTelegramCallbackMessage(
  bot: TelegramBot,
  callbackQuery: Record<string, unknown>,
  appendedLabel: string,
): Promise<void> {
  const message = getCallbackMessage(callbackQuery);
  if (!message) {
    return;
  }

  const chatId = Number((message.chat as Record<string, unknown> | undefined)?.id);
  const messageId = typeof message.message_id === "number" ? message.message_id : NaN;
  if (!Number.isFinite(chatId) || !Number.isFinite(messageId)) {
    return;
  }

  const baseText = getCallbackMessageText(message);
  const updatedText = baseText.length > 0 ? `${baseText}\n\n${appendedLabel}` : appendedLabel;

  try {
    await bot.api.editMessageText(chatId, messageId, updatedText, {
      reply_markup: { inline_keyboard: [] },
    });
  } catch {
    // Telegram callback edits are best-effort. Stale or already-edited messages
    // should not break the callback flow.
  }
}

function parseCommand(text: string): { command: string; args: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const [rawCommand, ...rest] = trimmed.split(/\s+/);
  const command = rawCommand.split("@")[0].toLowerCase();
  return {
    command,
    args: rest.join(" ").trim(),
  };
}

async function extractInboundFiles(
  supabase: TelegramAdminClient,
  bot: TelegramBot,
  clientId: string,
  message: Record<string, unknown>,
) {
  const supportedMediaTypes = [
    "photo",
    "document",
    "voice",
    "video",
    "audio",
    "animation",
    "video_note",
  ] as const;

  for (const mediaType of supportedMediaTypes) {
    const fileId = resolveFileId(mediaType, message);
    if (!fileId) {
      continue;
    }

    const { ext, mime } = getMediaFallbacks(mediaType);
    const storedFile = await downloadAndStoreTelegramFile(
      bot.api,
      supabase,
      clientId,
      fileId,
      ext,
      mime,
    );

    if (!storedFile) {
      return [];
    }

    return [{
      type: "file" as const,
      url: storedFile.url,
      mediaType: storedFile.mimeType,
    }];
  }

  return [];
}

async function handleStartCommand(
  supabase: TelegramAdminClient,
  bot: TelegramBot,
  message: Record<string, unknown>,
  token: string,
): Promise<void> {
  const chatId = String((message.chat as Record<string, unknown>).id);
  const numericChatId = Number(chatId);

  if (!isPairingTokenFormat(token)) {
    await sendPlainTelegramMessage(bot, numericChatId, "This pairing link is invalid.");
    return;
  }

  const existingMapping = await getTelegramMappingByChatId(supabase, chatId);
  if (existingMapping) {
    await sendPlainTelegramMessage(bot, numericChatId, "This Telegram chat is already connected.");
    return;
  }

  const { data: pairingToken, error: pairingError } = await supabase
    .from("telegram_pairing_tokens")
    .select("token, client_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (pairingError || !pairingToken || new Date(pairingToken.expires_at) <= new Date()) {
    await sendPlainTelegramMessage(bot, numericChatId, "This pairing link has expired.");
    return;
  }

  const threadId = randomUUID();
  const { error: threadError } = await supabase
    .from("conversation_threads")
    .insert({
      thread_id: threadId,
      client_id: pairingToken.client_id,
      title: null,
    });

  if (threadError) {
    throw threadError;
  }

  const { error: mappingError } = await supabase
    .from("conversation_channel_mappings")
    .insert({
      client_id: pairingToken.client_id,
      thread_id: threadId,
      channel: "telegram",
      external_conversation_id: chatId,
    });

  if (mappingError) {
    throw mappingError;
  }

  await supabase
    .from("telegram_pairing_tokens")
    .delete()
    .eq("token", token);

  await sendPlainTelegramMessage(bot, numericChatId, "Connected. You can message your agent here.");
}

async function handleNewCommand(
  supabase: TelegramAdminClient,
  bot: TelegramBot,
  message: Record<string, unknown>,
): Promise<void> {
  const chatId = String((message.chat as Record<string, unknown>).id);
  const numericChatId = Number(chatId);
  const mapping = await getTelegramMappingByChatId(supabase, chatId);

  if (!mapping) {
    await sendPlainTelegramMessage(
      bot,
      numericChatId,
      "This chat is not connected. Generate a new pairing link from Settings.",
    );
    return;
  }

  await clearPendingQuestionsForChat(supabase, chatId);

  const threadId = randomUUID();
  const { error: threadError } = await supabase
    .from("conversation_threads")
    .insert({
      thread_id: threadId,
      client_id: mapping.client_id,
      title: null,
    });

  if (threadError) {
    throw threadError;
  }

  const { error: updateError } = await supabase
    .from("conversation_channel_mappings")
    .update({ thread_id: threadId })
    .eq("channel", "telegram")
    .eq("external_conversation_id", chatId);

  if (updateError) {
    throw updateError;
  }

  await sendPlainTelegramMessage(bot, numericChatId, "Started a new Telegram chat.");
}

async function continueTelegramQuestionBatch(
  supabase: TelegramAdminClient,
  bot: TelegramBot,
  chatId: number,
  result: Awaited<ReturnType<typeof advancePendingQuestionBatchByCallback>>,
): Promise<boolean> {
  if (result.status !== "next") {
    return false;
  }

  try {
    if (result.question.type === "single_select") {
      await sendTelegramQuestion(
        bot.api,
        String(chatId),
        result.batch.token,
        result.questionIndex,
        result.question.question,
        result.question.options,
      );
      return true;
    }

    await sendPlainTelegramMessage(
      bot,
      chatId,
      buildUnsupportedQuestionFallback(
        result.question.question,
        result.question.options,
        result.question.type,
      ),
    );
    return true;
  } catch (error) {
    try {
      await restorePendingQuestionBatch(supabase, result.rollback);
    } catch (rollbackError) {
      console.error("[telegram/webhook] failed to restore pending question batch:", rollbackError);
    }

    throw error;
  }
}

async function runTelegramAgent(
  supabase: TelegramAdminClient,
  input: {
    clientId: string;
    threadId: string;
    text: string;
    fileParts?: Array<{ type: "file"; url: string; mediaType: string; filename?: string }>;
    chatId: number;
  },
) {
  const result = await runAgent(
    {
      clientId: input.clientId,
      threadId: input.threadId,
      triggerType: "chat",
      input: input.text,
      channel: "telegram",
      consumeMessageQuota: true,
      ...(input.fileParts && input.fileParts.length > 0 ? { fileParts: input.fileParts } : {}),
    },
    supabase,
  );

  if (result.status === "streaming") {
    await result.streamResult.text;
  }
}

async function handleRegularMessage(
  supabase: TelegramAdminClient,
  bot: TelegramBot,
  updateId: number,
  message: Record<string, unknown>,
): Promise<void> {
  const chatId = String((message.chat as Record<string, unknown>).id);
  const numericChatId = Number(chatId);
  const mapping = await getTelegramMappingByChatId(supabase, chatId);

  if (!mapping) {
    await sendPlainTelegramMessage(
      bot,
      numericChatId,
      "This chat is not connected. Generate a new pairing link from Settings.",
    );
    return;
  }

  const shouldContinue = await recordTelegramDeliveryReceipt(supabase, {
    clientId: mapping.client_id,
    threadId: mapping.thread_id,
    updateId,
  });
  if (!shouldContinue) {
    return;
  }

  const messageText = typeof message.text === "string"
    ? message.text.trim()
    : typeof message.caption === "string"
      ? message.caption.trim()
      : "";

  if (messageText) {
    const pendingTextReply = await advancePendingQuestionBatchByTextReply(supabase, {
      chatId,
      text: messageText,
    });

    if (pendingTextReply.status === "next") {
      await continueTelegramQuestionBatch(supabase, bot, numericChatId, pendingTextReply);
      return;
    }

    if (pendingTextReply.status === "completed") {
      await bot.api.sendChatAction(numericChatId, "typing");
      await runTelegramAgent(supabase, {
        clientId: pendingTextReply.clientId,
        threadId: pendingTextReply.threadId,
        text: pendingTextReply.responseText,
        chatId: numericChatId,
      });
      return;
    }
  }

  const fileParts = await extractInboundFiles(supabase, bot, mapping.client_id, message);
  if (!messageText && fileParts.length === 0) {
    return;
  }

  await bot.api.sendChatAction(numericChatId, "typing");
  await runTelegramAgent(supabase, {
    clientId: mapping.client_id,
    threadId: mapping.thread_id,
    text: messageText,
    fileParts,
    chatId: numericChatId,
  });
}

async function handleApprovalCallback(
  supabase: TelegramAdminClient,
  bot: TelegramBot,
  callbackQuery: Record<string, unknown>,
  callbackId: string,
  input: { action: "approve" | "deny"; approvalId: string },
): Promise<void> {
  const message = getCallbackMessage(callbackQuery);
  if (!message) {
    await bot.api.answerCallbackQuery(callbackId);
    return;
  }

  const chatId = String((message.chat as Record<string, unknown>).id);
  const mapping = await getTelegramMappingByChatId(supabase, chatId);
  if (!mapping) {
    await bot.api.answerCallbackQuery(callbackId, { text: "Not connected." });
    return;
  }

  const { data: approvalEvent } = await supabase
    .from("approval_events")
    .select("thread_id")
    .eq("approval_id", input.approvalId)
    .eq("client_id", mapping.client_id)
    .single();

  if (!approvalEvent) {
    await bot.api.answerCallbackQuery(callbackId, { text: "Approval not found." });
    return;
  }

  const approved = input.action === "approve";
  const result = await resolveAndContinueApproval(supabase, {
    clientId: mapping.client_id,
    threadId: approvalEvent.thread_id,
    approvalId: input.approvalId,
    approved,
  });

  if (result.success) {
    const statusLabel = result.status === "already_resolved"
      ? "Already resolved"
      : approved
        ? "✅ Approved"
        : "❌ Denied";
    await editTelegramCallbackMessage(bot, callbackQuery, statusLabel);
  }

  await bot.api.answerCallbackQuery(callbackId, {
    text: result.success
      ? (
        result.status === "already_resolved"
          ? "Already resolved."
          : approved
            ? "Approved — agent continuing"
            : "Denied"
      )
      : "Failed to process",
  });
}

async function handleQuestionCallback(
  supabase: TelegramAdminClient,
  bot: TelegramBot,
  callbackQuery: Record<string, unknown>,
  callbackId: string,
  input: { requestId: string; questionIndex: number; optionIndex: number },
): Promise<void> {
  const message = getCallbackMessage(callbackQuery);
  const chatId = Number((message?.chat as Record<string, unknown> | undefined)?.id);

  const result = await advancePendingQuestionBatchByCallback(supabase, {
    token: input.requestId,
    questionIndex: input.questionIndex,
    optionIndex: input.optionIndex,
  });

  if (result.status === "expired") {
    await bot.api.answerCallbackQuery(callbackId, {
      text: "This question has expired.",
    });
    return;
  }

  await bot.api.answerCallbackQuery(callbackId, { text: "Selected" });

  if (result.status === "next") {
    await continueTelegramQuestionBatch(supabase, bot, chatId, result);
    await editTelegramCallbackMessage(bot, callbackQuery, `✅ Selected: ${result.selectedOption}`);
    return;
  }

  await editTelegramCallbackMessage(bot, callbackQuery, `✅ Selected: ${result.selectedOption}`);
  await runTelegramAgent(supabase, {
    clientId: result.clientId,
    threadId: result.threadId,
    text: result.responseText,
    chatId,
  });
}

async function handleCallbackQuery(
  supabase: TelegramAdminClient,
  bot: TelegramBot,
  callbackQuery: Record<string, unknown>,
): Promise<void> {
  const data = typeof callbackQuery.data === "string" ? callbackQuery.data : "";
  const callbackId = typeof callbackQuery.id === "string" ? callbackQuery.id : "";

  if (!data || !callbackId) {
    await bot.api.answerCallbackQuery(callbackId);
    return;
  }

  const approval = parseApprovalCallback(data);
  if (approval) {
    await handleApprovalCallback(supabase, bot, callbackQuery, callbackId, approval);
    return;
  }

  const question = parseQuestionCallback(data);
  if (question) {
    await handleQuestionCallback(supabase, bot, callbackQuery, callbackId, question);
    return;
  }

  await bot.api.answerCallbackQuery(callbackId);
}

async function processUpdate(
  supabase: TelegramAdminClient,
  bot: TelegramBot,
  update: z.infer<typeof telegramUpdateSchema>,
): Promise<void> {
  if (update.message) {
    const text = typeof update.message.text === "string" ? update.message.text : "";
    const command = parseCommand(text);

    if (command?.command === "/start") {
      await handleStartCommand(supabase, bot, update.message, command.args);
      return;
    }

    if (command?.command === "/new") {
      await handleNewCommand(supabase, bot, update.message);
      return;
    }

    await handleRegularMessage(supabase, bot, update.update_id, update.message);
    return;
  }

  if (update.callback_query) {
    await handleCallbackQuery(supabase, bot, update.callback_query);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!hasValidTelegramSecret(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return Response.json({ error: "Invalid Telegram secret." }, { status: 401 });
  }

  const rawBody = await request.text();
  let parsedUpdate: z.infer<typeof telegramUpdateSchema>;
  try {
    parsedUpdate = telegramUpdateSchema.parse(JSON.parse(rawBody));
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const [supabase, bot] = await Promise.all([
    createAdminClient(),
    Promise.resolve(createTelegramBot(getTelegramBotToken())),
  ]);

  after(async () => {
    try {
      await processUpdate(supabase, bot, parsedUpdate);
    } catch (error) {
      console.error("[telegram/webhook] processing failed:", error);
    }
  });

  return Response.json({ ok: true });
}
