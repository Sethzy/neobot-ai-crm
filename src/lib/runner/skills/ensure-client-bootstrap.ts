/**
 * Durable one-time client bootstrap — seeds bundled instruction skills.
 *
 * Pre-D2 this also seeded memory files (SOUL.md / USER.md / MEMORY.md);
 * after D2 only skill seeding remains. The `is_bootstrapped` flag on
 * `clients` guards against re-running on every chat turn.
 *
 * @module lib/runner/skills/ensure-client-bootstrap
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { bootstrapSkills } from "./skill-bootstrap";

/**
 * Ensures bundled skills are seeded for a client exactly once.
 *
 * Safe to call on every chat turn. Reads `clients.is_bootstrapped`; if
 * already set, returns immediately without touching Storage. Otherwise
 * seeds default skills and flips the flag.
 */
export async function ensureClientBootstrap(
  supabase: SupabaseClient,
  clientId: string,
): Promise<void> {
  let { data: client, error: selectError } = await supabase
    .from("clients")
    .select("is_bootstrapped")
    .eq("client_id", clientId)
    .single();

  // Retry once on transient network failures (e.g. Turbopack HMR aborting in-flight fetches).
  if (selectError?.message?.includes("fetch failed")) {
    ({ data: client, error: selectError } = await supabase
      .from("clients")
      .select("is_bootstrapped")
      .eq("client_id", clientId)
      .single());
  }

  if (selectError) {
    throw new Error(`Failed to check bootstrap status: ${selectError.message}`);
  }

  if (client?.is_bootstrapped) {
    return;
  }

  await bootstrapSkills(supabase, clientId);

  const { error: updateError } = await supabase
    .from("clients")
    .update({ is_bootstrapped: true })
    .eq("client_id", clientId);

  if (updateError) {
    throw new Error(`Failed to mark client as bootstrapped: ${updateError.message}`);
  }
}
