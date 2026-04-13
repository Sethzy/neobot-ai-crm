/**
 * Lists the skill slugs for which the user has a customized `SKILL.md`
 * override in storage.
 *
 * @module lib/runner/skills/list-customized-skill-slugs
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { AGENT_FILES_BUCKET } from "@/lib/storage/agent-files";

const RESERVED_SKILL_DIRECTORIES = new Set(["connections", "system"]);

export async function listCustomizedSkillSlugs(
  supabase: SupabaseClient,
  clientId: string,
): Promise<string[]> {
  const bucket = supabase.storage.from(AGENT_FILES_BUCKET);
  const { data: entries, error } = await bucket.list(`${clientId}/skills`);

  if (error || !entries) {
    return [];
  }

  // Directories (id === null) under skills/ that aren't reserved exist only
  // because the client duplicated a predefined skill. No need to download
  // each SKILL.md to verify — the directory's existence IS the signal.
  return entries
    .filter((entry) => entry.id === null)
    .map((entry) => entry.name)
    .filter((slug) => !RESERVED_SKILL_DIRECTORIES.has(slug))
    .sort((left, right) => left.localeCompare(right));
}
