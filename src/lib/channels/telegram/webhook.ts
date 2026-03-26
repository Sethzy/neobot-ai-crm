/**
 * Shared Telegram webhook helpers — data-access, message editing, parsing.
 * Extracted from the route handler to keep the route a thin dispatcher.
 * @module lib/channels/telegram/webhook
 */
import { timingSafeEqual } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  downloadAndStoreTelegramFile,
  getMediaFallbacks,
  resolveFileId,
} from "@/lib/channels/telegram";
import type { Database } from "@/types/database";

import type { createTelegramBot } from "./bot";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TelegramAdminClient = SupabaseClient<Database>;
export type TelegramBot = ReturnType<typeof createTelegramBot>;

/** Bundled context passed to every webhook handler. */
export interface TelegramWebhookContext {
  supabase: TelegramAdminClient;
  bot: TelegramBot;
}

/** Shape of a resolved channel mapping row. */
export interface TelegramMapping {
  client_id: string;
  thread_id: string;
  external_conversation_id: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TELEGRAM_CHANNEL = "telegram" as const;

const NOT_CONNECTED_MESSAGE =
  "This chat is not connected. Generate a new pairing link from Settings.";

// ---------------------------------------------------------------------------
// Webhook secret validation
// ---------------------------------------------------------------------------

function getTelegramWebhookSecret(): string {
  const secret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
  if (!secret) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET is required.");
  }
  return secret;
}

export function hasValidTelegramSecret(headerValue: string | null): boolean {
  const expected = getTelegramWebhookSecret();
  const receivedBuffer = Buffer.from(headerValue ?? "");
  const expectedBuffer = Buffer.from(expected);

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

export function isDuplicateInsertError(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) {
    return false;
  }

  if (error.code === "23505") {
    return true;
  }

  return error.message?.toLowerCase().includes("duplicate") ?? false;
}

export async function getTelegramMappingByChatId(
  supabase: TelegramAdminClient,
  chatId: string,
): Promise<TelegramMapping | null> {
  const { data, error } = await supabase
    .from("conversation_channel_mappings")
    .select("client_id, thread_id, external_conversation_id")
    .eq("channel", TELEGRAM_CHANNEL)
    .eq("external_conversation_id", chatId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function recordTelegramDeliveryReceipt(
  supabase: TelegramAdminClient,
  input: { clientId: string; threadId: string; updateId: number },
): Promise<boolean> {
  const { error } = await supabase
    .from("conversation_channel_delivery_receipts")
    .insert({
      client_id: input.clientId,
      thread_id: input.threadId,
      channel: TELEGRAM_CHANNEL,
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

// ---------------------------------------------------------------------------
// Message helpers
// ---------------------------------------------------------------------------

export async function sendPlainTelegramMessage(
  bot: TelegramBot,
  chatId: number,
  text: string,
): Promise<void> {
  await bot.api.sendMessage(chatId, text, { parse_mode: "HTML" });
}

export function getCallbackMessage(
  callbackQuery: Record<string, unknown>,
): Record<string, unknown> | null {
  const message = callbackQuery.message;
  return typeof message === "object" && message !== null
    ? message as Record<string, unknown>
    : null;
}

export function getCallbackMessageText(
  message: Record<string, unknown>,
): string {
  if (typeof message.text === "string" && message.text.trim().length > 0) {
    return message.text;
  }

  if (typeof message.caption === "string" && message.caption.trim().length > 0) {
    return message.caption;
  }

  return "";
}

export async function editTelegramCallbackMessage(
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

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

export function parseCommand(
  text: string,
): { command: string; args: string } | null {
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

export function extractChatId(
  message: Record<string, unknown>,
): { chatId: string; numericChatId: number } {
  const chatId = String((message.chat as Record<string, unknown>).id);
  return { chatId, numericChatId: Number(chatId) };
}

// ---------------------------------------------------------------------------
// Inbound file extraction
// ---------------------------------------------------------------------------

export async function extractInboundFiles(
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

// ---------------------------------------------------------------------------
// Command preamble (shared by /new, /main, and regular messages)
// ---------------------------------------------------------------------------

/** Resolves the channel mapping for a command. Sends "not connected" if missing. */
export async function resolveCommandMapping(
  ctx: TelegramWebhookContext,
  message: Record<string, unknown>,
): Promise<{ chatId: string; numericChatId: number; mapping: TelegramMapping } | null> {
  const { chatId, numericChatId } = extractChatId(message);
  const mapping = await getTelegramMappingByChatId(ctx.supabase, chatId);

  if (!mapping) {
    await sendPlainTelegramMessage(ctx.bot, numericChatId, NOT_CONNECTED_MESSAGE);
    return null;
  }

  return { chatId, numericChatId, mapping };
}
