/**
 * User-profile helpers for default messaging thread preferences.
 * @module lib/settings/profile/messaging-preferences
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getPrimaryThread } from "@/lib/chat/threads";
import type { Database } from "@/types/database";

type MessagingPreferencesSupabaseClient = SupabaseClient<Database>;
type UserProfileRow = Database["public"]["Tables"]["user_profiles"]["Row"];

export interface MessagingThreadOption {
  isPrimary: boolean;
  threadId: string;
  title: string | null;
}

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
  const profile = await ensureUserProfile(supabase, input.userId);
  if (profile.default_messaging_thread_id) {
    return profile.default_messaging_thread_id;
  }

  const primaryThread = await getPrimaryThread(supabase, input.clientId);
  if (!primaryThread) {
    throw new Error("Primary thread not found.");
  }

  return primaryThread.thread_id;
}

/** Lists threads the user can target from personal messaging settings. */
export async function listAvailableMessagingThreads(
  supabase: MessagingPreferencesSupabaseClient,
  clientId: string,
): Promise<MessagingThreadOption[]> {
  const { data, error } = await supabase
    .from("conversation_threads")
    .select("thread_id, title, is_primary")
    .eq("client_id", clientId)
    .eq("is_archived", false)
    .order("is_primary", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((thread) => ({
    isPrimary: thread.is_primary,
    threadId: thread.thread_id,
    title: thread.title,
  }));
}

/** Saves the user's chosen default messaging thread in user_profiles. */
export async function saveDefaultMessagingThreadForUser(
  supabase: MessagingPreferencesSupabaseClient,
  input: { threadId: string; userId: string },
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("user_profiles")
    .upsert({
      id: input.userId,
      default_messaging_thread_id: input.threadId,
      updated_at: now,
    }, {
      onConflict: "id",
    });

  if (error) {
    throw new Error(error.message);
  }
}
