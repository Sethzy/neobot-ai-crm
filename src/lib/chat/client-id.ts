/**
 * Shared client_id resolution logic usable from server or browser Supabase clients.
 * @module lib/chat/client-id
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type ChatSupabaseClient = SupabaseClient<Database>;

/**
 * Resolves an authenticated user to client_id.
 * Attempts RPC first and falls back to a clients-table lookup.
 *
 * @param supabase - Supabase client scoped to the current auth context.
 * @param userIdOverride - Optional auth user id to skip an extra auth lookup in caller flows.
 */
export async function resolveClientId(
  supabase: ChatSupabaseClient,
  userIdOverride?: string,
): Promise<string> {
  const { data: rpcClientId, error: rpcError } = await supabase.rpc("get_my_client_id");

  if (!rpcError && rpcClientId) {
    return String(rpcClientId);
  }

  let userId = userIdOverride ?? null;

  if (!userId) {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("Could not resolve client_id: user not authenticated");
    }

    userId = user.id;
  }

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
