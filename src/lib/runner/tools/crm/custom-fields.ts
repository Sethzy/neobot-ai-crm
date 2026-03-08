/**
 * Shared helper for merging custom_fields on CRM entity updates.
 * Fetches the existing JSONB value then shallow-merges incoming keys on top.
 * @module lib/runner/tools/crm/custom-fields
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, JsonObject } from "@/types/database";

/**
 * Merges incoming custom_fields onto the existing record's custom_fields.
 * Returns `{ merged }` on success or `{ error }` on query failure.
 */
export async function mergeCustomFields(
  supabase: SupabaseClient<Database>,
  table: "contacts" | "companies" | "deals" | "crm_tasks",
  idColumn: string,
  recordId: string,
  clientId: string,
  incoming: JsonObject,
): Promise<{ merged: JsonObject; error?: never } | { merged?: never; error: string }> {
  const { data: existing, error: fetchError } = await supabase
    .from(table)
    .select("custom_fields")
    .eq(idColumn, recordId)
    .eq("client_id", clientId)
    .single();

  if (fetchError) {
    return { error: fetchError.message };
  }

  const merged = {
    ...((existing?.custom_fields as JsonObject | null) ?? {}),
    ...incoming,
  } satisfies JsonObject;

  return { merged };
}
