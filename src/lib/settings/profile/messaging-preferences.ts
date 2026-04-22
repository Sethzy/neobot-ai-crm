/**
 * User-profile helpers that preserve the profile row while always resolving
 * Telegram pairing back to the primary thread.
 * @module lib/settings/profile/messaging-preferences
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getPrimaryThread } from "@/lib/chat/threads";
import type { Database } from "@/types/database";

type MessagingPreferencesSupabaseClient = SupabaseClient<Database>;
type UserProfileRow = Database["public"]["Tables"]["user_profiles"]["Row"];

/** Loads the user's profile row or creates it on first access. */
export async function ensureUserProfile(
  supabase: MessagingPreferencesSupabaseClient,
  userId: string,
): Promise<UserProfileRow> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data) {
    return data;
  }

  const now = new Date().toISOString();
  const { data: insertedProfile, error: insertError } = await supabase
    .from("user_profiles")
    .insert({
      id: userId,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (insertError || !insertedProfile) {
    throw new Error(insertError?.message ?? "Failed to create user profile.");
  }

  return insertedProfile;
}

/** Resolves the active default messaging thread, falling back to the primary thread. */
export async function getDefaultMessagingThreadForUser(
  supabase: MessagingPreferencesSupabaseClient,
  input: { clientId: string; userId: string },
): Promise<string> {
  await ensureUserProfile(supabase, input.userId);

  const primaryThread = await getPrimaryThread(supabase, input.clientId);
  if (!primaryThread) {
    throw new Error("Primary thread not found.");
  }

  return primaryThread.thread_id;
}
