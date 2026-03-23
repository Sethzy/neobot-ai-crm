/**
 * Persistence helpers for mapping one Sprite to one conversation thread.
 * @module lib/sandbox/sprite-session
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import type { SpriteSessionRow } from "./types";

type SandboxSupabaseClient = SupabaseClient<Database>;

interface UpsertSpriteSessionInput {
  client_id: string;
  thread_id: string;
  sprite_name: string;
  status: "running" | "sleeping";
  preview_url?: string | null;
}

function toSpriteSessionRow(
  row: Database["public"]["Tables"]["sprite_sessions"]["Row"],
): SpriteSessionRow {
  return {
    ...row,
    status: row.status as SpriteSessionRow["status"],
  };
}

/**
 * Returns the current non-destroyed Sprite session for a thread, or null when none exists.
 */
export async function findActiveSpriteSession(
  supabase: SandboxSupabaseClient,
  threadId: string,
): Promise<SpriteSessionRow | null> {
  const { data, error } = await supabase
    .from("sprite_sessions")
    .select("*")
    .eq("thread_id", threadId)
    .neq("status", "destroyed")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return toSpriteSessionRow(data);
}

/**
 * Upserts the per-thread Sprite session row and refreshes its activity timestamp.
 */
export async function upsertSpriteSession(
  supabase: SandboxSupabaseClient,
  session: UpsertSpriteSessionInput,
): Promise<SpriteSessionRow | null> {
  const { data, error } = await supabase
    .from("sprite_sessions")
    .upsert(
      {
        client_id: session.client_id,
        thread_id: session.thread_id,
        sprite_name: session.sprite_name,
        status: session.status,
        preview_url: session.preview_url ?? null,
        last_active_at: new Date().toISOString(),
      },
      { onConflict: "thread_id" },
    )
    .select()
    .single();

  if (error || !data) {
    return null;
  }

  return toSpriteSessionRow(data);
}

/**
 * Refreshes the last-active timestamp after a successful sandbox operation.
 */
export async function touchSpriteSession(
  supabase: SandboxSupabaseClient,
  spriteName: string,
): Promise<void> {
  await supabase
    .from("sprite_sessions")
    .update({ last_active_at: new Date().toISOString() })
    .eq("sprite_name", spriteName);
}

/**
 * Marks a Sprite session as destroyed so the next run creates a fresh Sprite.
 */
export async function markSpriteDestroyed(
  supabase: SandboxSupabaseClient,
  spriteName: string,
): Promise<void> {
  await supabase
    .from("sprite_sessions")
    .update({
      status: "destroyed",
      destroyed_at: new Date().toISOString(),
    })
    .eq("sprite_name", spriteName);
}
