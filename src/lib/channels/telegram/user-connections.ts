/**
 * Persistence helpers for user-scoped Telegram ownership and pairing sessions.
 * @module lib/channels/telegram/user-connections
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import {
  isPairingDisplayCodeFormat,
  normalizePairingDisplayCode,
} from "./pairing";

type TelegramSupabaseClient = SupabaseClient<Database>;
type TelegramConnectionRow =
  Database["public"]["Tables"]["messaging_channel_connections"]["Row"];
type TelegramPairingSessionRow =
  Database["public"]["Tables"]["telegram_pairing_sessions"]["Row"];

const TELEGRAM_CHANNEL = "telegram" as const;

export interface TelegramConnection {
  clientId: string;
  externalConversationId: string;
  targetThreadId: string;
  userId: string;
}

export interface TelegramPairingSession {
  clientId: string;
  consumedAt: string | null;
  createdAt: string;
  deepLinkToken: string;
  displayCode: string;
  expiresAt: string;
  id: string;
  targetThreadId: string;
  userId: string;
}

export interface TelegramConnectionUpsertInput {
  clientId: string;
  externalConversationId: string;
  targetThreadId: string;
  userId: string;
}

export interface TelegramPairingSessionInput {
  clientId: string;
  deepLinkToken: string;
  displayCode: string;
  expiresAt: string;
  targetThreadId: string;
  userId: string;
}

export interface TelegramReadiness {
  isConfigured: boolean;
  missingVariables: string[];
}

function mapConnection(row: TelegramConnectionRow): TelegramConnection {
  return {
    clientId: row.client_id,
    externalConversationId: row.external_conversation_id,
    targetThreadId: row.target_thread_id,
    userId: row.user_id,
  };
}

function mapPairingSession(row: TelegramPairingSessionRow): TelegramPairingSession {
  return {
    clientId: row.client_id,
    consumedAt: row.consumed_at,
    createdAt: row.created_at,
    deepLinkToken: row.deep_link_token,
    displayCode: row.display_code,
    expiresAt: row.expires_at,
    id: row.id,
    targetThreadId: row.target_thread_id,
    userId: row.user_id,
  };
}

/** Reports whether Telegram can be offered in the UI before the user clicks connect. */
export function getTelegramReadiness(): TelegramReadiness {
  const missingVariables = [
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_WEBHOOK_SECRET",
  ].filter((key) => !(process.env[key] ?? "").trim());

  return {
    isConfigured: missingVariables.length === 0,
    missingVariables,
  };
}

/** Loads the current user's Telegram connection, if they have one. */
export async function getTelegramConnectionForUser(
  supabase: TelegramSupabaseClient,
  userId: string,
): Promise<TelegramConnection | null> {
  const { data, error } = await supabase
    .from("messaging_channel_connections")
    .select("client_id, external_conversation_id, target_thread_id, user_id")
    .eq("channel", TELEGRAM_CHANNEL)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapConnection(data as TelegramConnectionRow) : null;
}

/** Loads the Telegram connection that currently owns a chat id, if any. */
export async function getTelegramConnectionByChatId(
  supabase: TelegramSupabaseClient,
  chatId: string,
): Promise<TelegramConnection | null> {
  const { data, error } = await supabase
    .from("messaging_channel_connections")
    .select("client_id, external_conversation_id, target_thread_id, user_id")
    .eq("channel", TELEGRAM_CHANNEL)
    .eq("external_conversation_id", chatId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapConnection(data as TelegramConnectionRow) : null;
}

/** Inserts or replaces the Telegram chat owned by a given user. */
export async function upsertTelegramConnection(
  supabase: TelegramSupabaseClient,
  input: TelegramConnectionUpsertInput,
): Promise<TelegramConnection> {
  const { data, error } = await supabase
    .from("messaging_channel_connections")
    .upsert({
      user_id: input.userId,
      client_id: input.clientId,
      channel: TELEGRAM_CHANNEL,
      external_conversation_id: input.externalConversationId,
      target_thread_id: input.targetThreadId,
    }, {
      onConflict: "user_id,channel",
    })
    .select("client_id, external_conversation_id, target_thread_id, user_id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to upsert Telegram connection.");
  }

  return mapConnection(data as TelegramConnectionRow);
}

/** Re-targets the user's Telegram connection to a different thread. */
export async function updateTelegramConnectionTargetThread(
  supabase: TelegramSupabaseClient,
  input: { targetThreadId: string; userId: string },
): Promise<TelegramConnection | null> {
  const { data, error } = await supabase
    .from("messaging_channel_connections")
    .update({ target_thread_id: input.targetThreadId })
    .eq("channel", TELEGRAM_CHANNEL)
    .eq("user_id", input.userId)
    .select("client_id, external_conversation_id, target_thread_id, user_id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapConnection(data as TelegramConnectionRow) : null;
}

/** Deletes the current user's Telegram connection row and returns the deleted row. */
export async function deleteTelegramConnectionForUser(
  supabase: TelegramSupabaseClient,
  userId: string,
): Promise<TelegramConnection | null> {
  const { data, error } = await supabase
    .from("messaging_channel_connections")
    .delete()
    .eq("channel", TELEGRAM_CHANNEL)
    .eq("user_id", userId)
    .select("client_id, external_conversation_id, target_thread_id, user_id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapConnection(data as TelegramConnectionRow) : null;
}

/** Keeps the legacy thread-routing table aligned with the personal connection row. */
export async function upsertTelegramChannelMapping(
  supabase: TelegramSupabaseClient,
  input: { chatId: string; clientId: string; threadId: string },
): Promise<void> {
  const { error } = await supabase
    .from("conversation_channel_mappings")
    .upsert({
      client_id: input.clientId,
      channel: TELEGRAM_CHANNEL,
      external_conversation_id: input.chatId,
      thread_id: input.threadId,
    }, {
      onConflict: "channel,external_conversation_id",
    });

  if (error) {
    throw new Error(error.message);
  }
}

/** Removes a Telegram routing row for a given chat id. */
export async function deleteTelegramChannelMapping(
  supabase: TelegramSupabaseClient,
  input: { chatId: string; clientId?: string },
): Promise<void> {
  let query = supabase
    .from("conversation_channel_mappings")
    .delete()
    .eq("channel", TELEGRAM_CHANNEL)
    .eq("external_conversation_id", input.chatId);

  if (input.clientId) {
    query = query.eq("client_id", input.clientId);
  }

  const { error } = await query;
  if (error) {
    throw new Error(error.message);
  }
}

/** Deletes any still-open pairing sessions for the current user before issuing a new code. */
export async function clearTelegramPairingSessionsForUser(
  supabase: TelegramSupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("telegram_pairing_sessions")
    .delete()
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }
}

/** Persists a new Telegram pairing session. */
export async function createTelegramPairingSession(
  supabase: TelegramSupabaseClient,
  input: TelegramPairingSessionInput,
): Promise<TelegramPairingSession> {
  const { data, error } = await supabase
    .from("telegram_pairing_sessions")
    .insert({
      user_id: input.userId,
      client_id: input.clientId,
      target_thread_id: input.targetThreadId,
      deep_link_token: input.deepLinkToken,
      display_code: input.displayCode,
      expires_at: input.expiresAt,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create Telegram pairing session.");
  }

  return mapPairingSession(data as TelegramPairingSessionRow);
}

/** Looks up a pairing session by deep-link token or manual display code. */
export async function findTelegramPairingSession(
  supabase: TelegramSupabaseClient,
  candidate: string,
): Promise<TelegramPairingSession | null> {
  const normalizedCandidate = normalizePairingDisplayCode(candidate);
  const lookupField = isPairingDisplayCodeFormat(normalizedCandidate)
    ? "display_code"
    : "deep_link_token";
  const lookupValue = lookupField === "display_code" ? normalizedCandidate : candidate;

  const { data, error } = await supabase
    .from("telegram_pairing_sessions")
    .select("*")
    .eq(lookupField, lookupValue)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapPairingSession(data as TelegramPairingSessionRow) : null;
}

/** Marks a pairing session consumed after successful chat ownership handoff. */
export async function markTelegramPairingSessionConsumed(
  supabase: TelegramSupabaseClient,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("telegram_pairing_sessions")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", sessionId);

  if (error) {
    throw new Error(error.message);
  }
}
