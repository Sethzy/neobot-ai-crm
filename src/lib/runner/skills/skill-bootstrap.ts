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
  INNER_SKILL_REFERENCES,
  type DefaultSkillSlug,
} from "./skill-templates";

const SKILLS_DIRECTORY = "skills";
const RESERVED_SKILL_DIRECTORIES = new Set(["system", "connections", "superpowers"]);

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
 * Seeds reference files for an inner skill. Called for ALL inner skills on every
 * bootstrap — not just missing ones — so that new reference files get backfilled
 * into existing skill directories. Uses upsert:false to avoid overwriting user edits.
 */
async function backfillReferenceFiles(
  supabase: SupabaseClient,
  clientId: string,
  slug: DefaultSkillSlug,
): Promise<void> {
  const refs = INNER_SKILL_REFERENCES[slug];
  if (!refs) return;

  await Promise.all(
    Object.entries(refs).map(async ([refPath, refContent]) => {
      const fullPath = `${clientId}/${SKILLS_DIRECTORY}/${slug}/${refPath}`;
      const { error } = await supabase.storage
        .from(MEMORY_BUCKET_ID)
        .upload(fullPath, refContent, {
          upsert: false,
          contentType: MEMORY_TEXT_CONTENT_TYPE,
        });

      if (error && !isStorageConflictError(error)) {
        throw new Error(
          `Failed to bootstrap skill reference ${slug}/${refPath}: ${getStorageErrorMessage(error)}`,
        );
      }
    }),
  );
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

  // Backfill reference files for ALL inner skills (even existing ones) so new
  // reference files added in code updates get seeded into existing directories.
  const innerSlugsWithRefs = DEFAULT_SKILL_SLUGS.filter((slug) => slug in INNER_SKILL_REFERENCES);
  if (innerSlugsWithRefs.length > 0) {
    await Promise.all(innerSlugsWithRefs.map((slug) => backfillReferenceFiles(supabase, clientId, slug)));
  }

  // PR 55: Force-overwrite skills whose bodies changed in the sandbox generalization.
  await migrateSkillBodies(supabase, clientId);

  bootstrappedClients.add(clientId);
}

/**
 * Force-overwrites skill bodies that changed in the sandbox generalization (PR 55).
 * Uses upsert: true (unlike bootstrapSkills which uses upsert: false).
 * Called from bootstrapSkills after initial seeding completes.
 */
const MIGRATED_SKILL_SLUGS: DefaultSkillSlug[] = [
  "deal-comparison",
  "property-showcase",
  "market-report",
  "re-analyst",
  "frontend-design",
];

const SKILL_MIGRATION_VERSION = "pr55-sandbox-generalization";
const migratedClients = new Set<string>();

export async function migrateSkillBodies(
  supabase: SupabaseClient,
  clientId: string,
): Promise<void> {
  if (migratedClients.has(clientId)) return;

  // Check version marker to avoid repeat migrations
  const markerPath = `${clientId}/${SKILLS_DIRECTORY}/.migration-${SKILL_MIGRATION_VERSION}`;
  const { data: marker } = await supabase.storage
    .from(MEMORY_BUCKET_ID)
    .download(markerPath);
  if (marker) {
    migratedClients.add(clientId);
    return;
  }

  let allSucceeded = true;
  for (const slug of MIGRATED_SKILL_SLUGS) {
    const content = DEFAULT_SKILL_CONTENT[slug];
    const storagePath = `${clientId}/${SKILLS_DIRECTORY}/${slug}/SKILL.md`;
    const { error } = await supabase.storage
      .from(MEMORY_BUCKET_ID)
      .upload(storagePath, content, {
        upsert: true,
        contentType: MEMORY_TEXT_CONTENT_TYPE,
      });
    if (error) {
      allSucceeded = false;
    }
  }

  // Only write version marker if all skills migrated successfully
  if (!allSucceeded) return;
  await supabase.storage
    .from(MEMORY_BUCKET_ID)
    .upload(markerPath, SKILL_MIGRATION_VERSION, {
      upsert: true,
      contentType: MEMORY_TEXT_CONTENT_TYPE,
    });

  migratedClients.add(clientId);
}

/** Clears the process-local bootstrap cache. Exposed for tests. */
export function _resetSkillBootstrapCache(): void {
  bootstrappedClients.clear();
  migratedClients.clear();
}
