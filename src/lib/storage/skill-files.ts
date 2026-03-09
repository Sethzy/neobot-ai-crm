/**
 * Connection-scoped skill file helpers for Supabase Storage.
 * @module lib/storage/skill-files
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

const BUCKET_ID = "agent-files";

/**
 * Returns the storage path for a connection-specific skill file.
 */
export function getConnectionSkillPath(clientId: string, connectionId: string): string {
  return `${clientId}/skills/connections/${connectionId}/SKILL.md`;
}

/**
 * Reads the skill file content for one connection, if present.
 */
export async function getConnectionSkillContent(
  supabase: SupabaseClient<Database>,
  clientId: string,
  connectionId: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET_ID)
    .download(getConnectionSkillPath(clientId, connectionId));

  if (error || !data) {
    return null;
  }

  return typeof data.text === "function" ? data.text() : null;
}
