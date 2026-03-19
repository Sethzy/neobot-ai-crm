/**
 * Seeds bundled default instruction skills into client storage.
 * @module lib/runner/skills/skill-bootstrap
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  MEMORY_BUCKET_ID,
  MEMORY_TEXT_CONTENT_TYPE,
} from "@/lib/memory/constants";
import {
  getStorageErrorMessage,
  isStorageConflictError,
} from "@/lib/memory/storage";

import {
  DEFAULT_SKILL_CONTENT,
  DEFAULT_SKILL_SLUGS,
  type DefaultSkillSlug,
} from "./skill-templates";

const SKILLS_DIRECTORY = "skills";
const RESERVED_SKILL_DIRECTORIES = new Set(["system", "connections"]);

const bootstrappedClients = new Set<string>();

async function uploadDefaultSkill(
  supabase: SupabaseClient,
  clientId: string,
  slug: DefaultSkillSlug,
): Promise<void> {
  const content = DEFAULT_SKILL_CONTENT[slug];
  const storagePath = `${clientId}/${SKILLS_DIRECTORY}/${slug}/SKILL.md`;
  const { error } = await supabase.storage
    .from(MEMORY_BUCKET_ID)
    .upload(storagePath, content, {
      upsert: false,
      contentType: MEMORY_TEXT_CONTENT_TYPE,
    });

  if (error && !isStorageConflictError(error)) {
    throw new Error(`Failed to bootstrap skill ${slug}: ${getStorageErrorMessage(error)}`);
  }
}

/**
 * Ensures bundled instruction skill defaults exist in client storage.
 */
export async function bootstrapSkills(
  supabase: SupabaseClient,
  clientId: string,
): Promise<void> {
  if (bootstrappedClients.has(clientId)) {
    return;
  }

  const bucket = supabase.storage.from(MEMORY_BUCKET_ID);
  const { data: entries, error } = await bucket.list(`${clientId}/${SKILLS_DIRECTORY}`);

  if (error) {
    throw new Error(`Failed to list skills directory: ${getStorageErrorMessage(error)}`);
  }

  const existingSlugs = new Set(
    (entries ?? [])
      .filter((entry) => entry.id === null)
      .map((entry) => entry.name)
      .filter((name) => !RESERVED_SKILL_DIRECTORIES.has(name)),
  );

  const missingSlugs = DEFAULT_SKILL_SLUGS.filter((slug) => !existingSlugs.has(slug));

  if (missingSlugs.length > 0) {
    await Promise.all(missingSlugs.map((slug) => uploadDefaultSkill(supabase, clientId, slug)));
  }

  bootstrappedClients.add(clientId);
}

/** Clears the process-local bootstrap cache. Exposed for tests. */
export function _resetSkillBootstrapCache(): void {
  bootstrappedClients.clear();
}
