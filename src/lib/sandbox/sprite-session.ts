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

  if (error) {
    throw new Error(`Failed to read sprite session for thread "${threadId}": ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return toSpriteSessionRow(data);
}

/**
 * Returns the most recently active non-destroyed Sprite session for a client.
 * Phase A lookup: ORDER BY last_active_at DESC LIMIT 1 (no unique index required).
 */
export async function findActiveSpriteSessionByClient(
  supabase: SandboxSupabaseClient,
  clientId: string,
): Promise<SpriteSessionRow | null> {
  const { data, error } = await supabase
    .from("sprite_sessions")
    .select("*")
    .eq("client_id", clientId)
    .neq("status", "destroyed")
    .order("last_active_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read sprite session for client "${clientId}": ${error.message}`);
  }

  return data ? toSpriteSessionRow(data) : null;
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
    throw new Error(
      `Failed to upsert sprite session for thread "${session.thread_id}": ${error?.message ?? "unknown error"}`,
    );
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
  const { error } = await supabase
    .from("sprite_sessions")
    .update({ last_active_at: new Date().toISOString() })
    .eq("sprite_name", spriteName);

  if (error) {
    throw new Error(`Failed to touch sprite session "${spriteName}": ${error.message}`);
  }
}

/**
 * Marks a Sprite session as destroyed so the next run creates a fresh Sprite.
 */
export async function markSpriteDestroyed(
  supabase: SandboxSupabaseClient,
  spriteName: string,
): Promise<void> {
  const { error } = await supabase
    .from("sprite_sessions")
    .update({
      status: "destroyed",
      destroyed_at: new Date().toISOString(),
    })
    .eq("sprite_name", spriteName);

  if (error) {
    throw new Error(`Failed to destroy sprite session "${spriteName}": ${error.message}`);
  }
}
