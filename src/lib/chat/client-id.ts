/**
 * Shared client_id resolution logic usable from server or browser Supabase clients.
 * @module lib/chat/client-id
 */
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type ChatSupabaseClient = SupabaseClient<Database>;

async function loadClientIdByUserId(
  supabase: ChatSupabaseClient,
  userId: string,
): Promise<string> {
  const { data: clientRow, error: clientError } = await supabase
    .from("clients")
    .select("client_id")
    .eq("user_id", userId)
    .single();

  if (clientError || !clientRow?.client_id) {
    throw new Error("Could not resolve client_id");
  }

  return clientRow.client_id;
}

/**
 * Resolves an authenticated user to client_id.
 * Attempts RPC first and falls back to a clients-table lookup.
 *
 * @param supabase - Supabase client scoped to the current auth context.
 * @param userIdOverride - Optional auth user id to skip an extra auth lookup in caller flows.
 */
export const resolveClientId = cache(async function resolveClientId(
  supabase: ChatSupabaseClient,
  userIdOverride?: string,
): Promise<string> {
  // Server-side callers often already paid the auth lookup and have the
  // user id in hand. Skip the RPC in that case to avoid an extra round-trip
  // on latency-sensitive request paths like chat send.
  if (userIdOverride) {
    return loadClientIdByUserId(supabase, userIdOverride);
  }

  const { data: rpcClientId, error: rpcError } = await supabase.rpc("get_my_client_id");

  if (!rpcError && rpcClientId) {
    return String(rpcClientId);
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Could not resolve client_id: user not authenticated");
  }

  return loadClientIdByUserId(supabase, user.id);
});
