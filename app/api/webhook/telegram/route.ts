/**
 * Telegram webhook ingress.
 * Handles pairing, inbound messages, approvals, and ask_user_question callbacks.
 * @module app/api/webhook/telegram/route
 */
import { randomUUID } from "node:crypto";

import { after } from "next/server";
import { z } from "zod";

import { resolveAndContinueApproval } from "@/lib/approvals/continue-after-approval";
import {
  buildUnsupportedQuestionFallback,
  createTelegramBot,
  getTelegramBotToken,
  isPairingTokenFormat,
  parseApprovalCallback,
  parseQuestionCallback,
  sendTelegramQuestion,
} from "@/lib/channels/telegram";
import {
  advancePendingQuestionBatchByCallback,
  advancePendingQuestionBatchByTextReply,
  clearPendingQuestionsForChat,
  restorePendingQuestionBatch,
} from "@/lib/channels/telegram/pending-questions";
import {
  editTelegramCallbackMessage,
  extractChatId,
  extractInboundFiles,
  getCallbackMessage,
  hasValidTelegramSecret,
  parseCommand,
  recordTelegramDeliveryReceipt,
  resolveCommandMapping,
  sendPlainTelegramMessage,
  TELEGRAM_CHANNEL,
  type TelegramWebhookContext,
} from "@/lib/channels/telegram/webhook";
import { runAgent } from "@/lib/runner/run-agent";
import { createAdminClient } from "@/lib/supabase/server";

const telegramUpdateSchema = z.object({
  update_id: z.number().int(),
  message: z.record(z.string(), z.unknown()).optional(),
  callback_query: z.record(z.string(), z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// /start — pairing
// ---------------------------------------------------------------------------

async function handleStartCommand(
  ctx: TelegramWebhookContext,
  message: Record<string, unknown>,
  token: string,
): Promise<void> {
  const { chatId, numericChatId } = extractChatId(message);

  if (!isPairingTokenFormat(token)) {
    await sendPlainTelegramMessage(ctx.bot, numericChatId, "This pairing link is invalid.");
    return;
  }

  const { data: existingMapping } = await ctx.supabase
    .from("conversation_channel_mappings")
    .select("client_id")
    .eq("channel", TELEGRAM_CHANNEL)
    .eq("external_conversation_id", chatId)
    .maybeSingle();

  if (existingMapping) {
    await sendPlainTelegramMessage(ctx.bot, numericChatId, "This Telegram chat is already connected.");
    return;
  }

  const { data: pairingToken, error: pairingError } = await ctx.supabase
    .from("telegram_pairing_tokens")
    .select("token, client_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (pairingError || !pairingToken || new Date(pairingToken.expires_at) <= new Date()) {
    await sendPlainTelegramMessage(ctx.bot, numericChatId, "This pairing link has expired.");
    return;
  }

  const { data: primaryThread, error: primaryError } = await ctx.supabase
    .from("conversation_threads")
    .select("thread_id")
    .eq("client_id", pairingToken.client_id)
    .eq("is_primary", true)
    .single();

  if (primaryError || !primaryThread) {
    await sendPlainTelegramMessage(ctx.bot, numericChatId, "Setup incomplete. Please try again.");
    return;
  }

  const { error: mappingError } = await ctx.supabase
    .from("conversation_channel_mappings")
    .insert({
      client_id: pairingToken.client_id,
      thread_id: primaryThread.thread_id,
      channel: TELEGRAM_CHANNEL,
      external_conversation_id: chatId,
    });

  if (mappingError) {
    throw mappingError;
  }

  await ctx.supabase
    .from("telegram_pairing_tokens")
    .delete()
    .eq("token", token);

  await sendPlainTelegramMessage(ctx.bot, numericChatId, "Connected. You can message your agent here.");
}

// ---------------------------------------------------------------------------
// /new — create fresh thread
// ---------------------------------------------------------------------------

async function handleNewCommand(
  ctx: TelegramWebhookContext,
  message: Record<string, unknown>,
): Promise<void> {
  const resolved = await resolveCommandMapping(ctx, message);
  if (!resolved) return;
  const { chatId, numericChatId, mapping } = resolved;

  await clearPendingQuestionsForChat(ctx.supabase, chatId);

  const threadId = randomUUID();
  const { error: threadError } = await ctx.supabase
    .from("conversation_threads")
    .insert({
      thread_id: threadId,
      client_id: mapping.client_id,
      title: null,
    });

  if (threadError) {
    throw threadError;
  }

  const { error: updateError } = await ctx.supabase
    .from("conversation_channel_mappings")
    .update({ thread_id: threadId })
    .eq("channel", TELEGRAM_CHANNEL)
    .eq("external_conversation_id", chatId);

  if (updateError) {
    throw updateError;
  }

  await sendPlainTelegramMessage(ctx.bot, numericChatId, "Started a new Telegram chat.");
}

// ---------------------------------------------------------------------------
// /main — switch back to primary thread
// ---------------------------------------------------------------------------

async function handleMainCommand(
  ctx: TelegramWebhookContext,
  message: Record<string, unknown>,
): Promise<void> {
  const resolved = await resolveCommandMapping(ctx, message);
  if (!resolved) return;
  const { chatId, numericChatId, mapping } = resolved;

  const { data: primaryThread, error: primaryError } = await ctx.supabase
    .from("conversation_threads")
    .select("thread_id")
    .eq("client_id", mapping.client_id)
    .eq("is_primary", true)
    .single();

  if (primaryError || !primaryThread) {
    await sendPlainTelegramMessage(ctx.bot, numericChatId, "Primary thread not found.");
    return;
  }

  // BUG FIX: Only clear pending questions when actually switching threads.
  // Previously, clearPendingQuestionsForChat ran before this guard, discarding
  // active question flows even when the user was already on main.
  if (mapping.thread_id === primaryThread.thread_id) {
    await sendPlainTelegramMessage(ctx.bot, numericChatId, "Already in the main session.");
    return;
  }

  await clearPendingQuestionsForChat(ctx.supabase, chatId);

  const { error: updateError } = await ctx.supabase
    .from("conversation_channel_mappings")
    .update({ thread_id: primaryThread.thread_id })
    .eq("channel", TELEGRAM_CHANNEL)
    .eq("external_conversation_id", chatId);

  if (updateError) {
    throw updateError;
  }

  await sendPlainTelegramMessage(ctx.bot, numericChatId, "Switched back to main session.");
}

// ---------------------------------------------------------------------------
// Question continuation helper
// ---------------------------------------------------------------------------

async function continueTelegramQuestionBatch(
  ctx: TelegramWebhookContext,
  chatId: number,
  result: Awaited<ReturnType<typeof advancePendingQuestionBatchByCallback>>,
): Promise<boolean> {
  if (result.status !== "next") {
    return false;
  }

  try {
    if (result.question.type === "single_select") {
      await sendTelegramQuestion(
        ctx.bot.api,
        String(chatId),
        result.batch.token,
        result.questionIndex,
        result.question.question,
        result.question.options,
      );
      return true;
    }

    await sendPlainTelegramMessage(
      ctx.bot,
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
      await restorePendingQuestionBatch(ctx.supabase, result.rollback);
    } catch (rollbackError) {
      console.error("[telegram/webhook] failed to restore pending question batch:", rollbackError);
    }

    throw error;
  }
}

// ---------------------------------------------------------------------------
// Agent run helper
// ---------------------------------------------------------------------------

async function runTelegramAgent(
  ctx: TelegramWebhookContext,
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
      channel: TELEGRAM_CHANNEL,
      consumeMessageQuota: true,
      ...(input.fileParts && input.fileParts.length > 0 ? { fileParts: input.fileParts } : {}),
    },
    ctx.supabase,
  );

  if (result.status === "streaming") {
    await result.streamResult.text;
  }
}

// ---------------------------------------------------------------------------
// Regular messages
// ---------------------------------------------------------------------------

async function handleRegularMessage(
  ctx: TelegramWebhookContext,
  updateId: number,
  message: Record<string, unknown>,
): Promise<void> {
  const resolved = await resolveCommandMapping(ctx, message);
  if (!resolved) return;
  const { numericChatId, mapping } = resolved;

  const shouldContinue = await recordTelegramDeliveryReceipt(ctx.supabase, {
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
    const pendingTextReply = await advancePendingQuestionBatchByTextReply(ctx.supabase, {
      chatId: resolved.chatId,
      text: messageText,
    });

    if (pendingTextReply.status === "next") {
      await continueTelegramQuestionBatch(ctx, numericChatId, pendingTextReply);
      return;
    }

    if (pendingTextReply.status === "completed") {
      await ctx.bot.api.sendChatAction(numericChatId, "typing");
      await runTelegramAgent(ctx, {
        clientId: pendingTextReply.clientId,
        threadId: pendingTextReply.threadId,
        text: pendingTextReply.responseText,
        chatId: numericChatId,
      });
      return;
    }
  }

  const fileParts = await extractInboundFiles(ctx.supabase, ctx.bot, mapping.client_id, message);
  if (!messageText && fileParts.length === 0) {
    return;
  }

  await ctx.bot.api.sendChatAction(numericChatId, "typing");
  await runTelegramAgent(ctx, {
    clientId: mapping.client_id,
    threadId: mapping.thread_id,
    text: messageText,
    fileParts,
    chatId: numericChatId,
  });
}

// ---------------------------------------------------------------------------
// Approval callbacks
// ---------------------------------------------------------------------------

async function handleApprovalCallback(
  ctx: TelegramWebhookContext,
  callbackQuery: Record<string, unknown>,
  callbackId: string,
  input: { action: "approve" | "deny"; approvalId: string },
): Promise<void> {
  const message = getCallbackMessage(callbackQuery);
  if (!message) {
    await ctx.bot.api.answerCallbackQuery(callbackId);
    return;
  }

  const { chatId } = extractChatId(message);
  const { data: mapping } = await ctx.supabase
    .from("conversation_channel_mappings")
    .select("client_id, thread_id, external_conversation_id")
    .eq("channel", TELEGRAM_CHANNEL)
    .eq("external_conversation_id", chatId)
    .maybeSingle();

  if (!mapping) {
    await ctx.bot.api.answerCallbackQuery(callbackId, { text: "Not connected." });
    return;
  }

  const { data: approvalEvent } = await ctx.supabase
    .from("approval_events")
    .select("thread_id")
    .eq("approval_id", input.approvalId)
    .eq("client_id", mapping.client_id)
    .single();

  if (!approvalEvent) {
    await ctx.bot.api.answerCallbackQuery(callbackId, { text: "Approval not found." });
    return;
  }

  const approved = input.action === "approve";

  // BUG FIX: Detect stale approvals from a previous session. After /new or /main,
  // the mapping points to a different thread than the approval. The agent will run
  // on the old thread, but delivery targets the current mapping — so the follow-up
  // would silently vanish. Warn the user so they know where to look.
  const isStaleThread = approvalEvent.thread_id !== mapping.thread_id;

  const result = await resolveAndContinueApproval(ctx.supabase, {
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
    await editTelegramCallbackMessage(ctx.bot, callbackQuery, statusLabel);
  }

  await ctx.bot.api.answerCallbackQuery(callbackId, {
    text: result.success
      ? (
        result.status === "already_resolved"
          ? "Already resolved."
          : approved
            ? isStaleThread
              ? "Approved — response in web app (session changed)"
              : "Approved — agent continuing"
            : "Denied"
      )
      : "Failed to process",
  });
}

// ---------------------------------------------------------------------------
// Question callbacks
// ---------------------------------------------------------------------------

async function handleQuestionCallback(
  ctx: TelegramWebhookContext,
  callbackQuery: Record<string, unknown>,
  callbackId: string,
  input: { requestId: string; questionIndex: number; optionIndex: number },
): Promise<void> {
  const message = getCallbackMessage(callbackQuery);
  const chatId = Number((message?.chat as Record<string, unknown> | undefined)?.id);

  const result = await advancePendingQuestionBatchByCallback(ctx.supabase, {
    token: input.requestId,
    questionIndex: input.questionIndex,
    optionIndex: input.optionIndex,
  });

  if (result.status === "expired") {
    await ctx.bot.api.answerCallbackQuery(callbackId, {
      text: "This question has expired.",
    });
    return;
  }

  await ctx.bot.api.answerCallbackQuery(callbackId, { text: "Selected" });

  if (result.status === "next") {
    await continueTelegramQuestionBatch(ctx, chatId, result);
    await editTelegramCallbackMessage(ctx.bot, callbackQuery, `✅ Selected: ${result.selectedOption}`);
    return;
  }

  await editTelegramCallbackMessage(ctx.bot, callbackQuery, `✅ Selected: ${result.selectedOption}`);
  await runTelegramAgent(ctx, {
    clientId: result.clientId,
    threadId: result.threadId,
    text: result.responseText,
    chatId,
  });
}

// ---------------------------------------------------------------------------
// Callback query dispatcher
// ---------------------------------------------------------------------------

async function handleCallbackQuery(
  ctx: TelegramWebhookContext,
  callbackQuery: Record<string, unknown>,
): Promise<void> {
  const data = typeof callbackQuery.data === "string" ? callbackQuery.data : "";
  const callbackId = typeof callbackQuery.id === "string" ? callbackQuery.id : "";

  if (!data || !callbackId) {
    await ctx.bot.api.answerCallbackQuery(callbackId);
    return;
  }

  const approval = parseApprovalCallback(data);
  if (approval) {
    await handleApprovalCallback(ctx, callbackQuery, callbackId, approval);
    return;
  }

  const question = parseQuestionCallback(data);
  if (question) {
    await handleQuestionCallback(ctx, callbackQuery, callbackId, question);
    return;
  }

  await ctx.bot.api.answerCallbackQuery(callbackId);
}

// ---------------------------------------------------------------------------
// Top-level update dispatcher
// ---------------------------------------------------------------------------

async function processUpdate(
  ctx: TelegramWebhookContext,
  update: z.infer<typeof telegramUpdateSchema>,
): Promise<void> {
  if (update.message) {
    const text = typeof update.message.text === "string" ? update.message.text : "";
    const command = parseCommand(text);

    if (command?.command === "/start") {
      await handleStartCommand(ctx, update.message, command.args);
      return;
    }

    if (command?.command === "/new") {
      await handleNewCommand(ctx, update.message);
      return;
    }

    if (command?.command === "/main") {
      await handleMainCommand(ctx, update.message);
      return;
    }

    await handleRegularMessage(ctx, update.update_id, update.message);
    return;
  }

  if (update.callback_query) {
    await handleCallbackQuery(ctx, update.callback_query);
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

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

  const ctx: TelegramWebhookContext = { supabase, bot };

  after(async () => {
    try {
      await processUpdate(ctx, parsedUpdate);
    } catch (error) {
      console.error("[telegram/webhook] processing failed:", error);
    }
  });

  return Response.json({ ok: true });
}
