"use server";
/**
 * Server actions and helpers for user-customized skill bundles.
 *
 * @module lib/runner/skills/skill-actions
 */
import fs from "node:fs";
import path from "node:path";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveClientId } from "@/lib/chat/client-id";
import { createAgentFileClient, AGENT_FILES_BUCKET } from "@/lib/storage/agent-files";
import { createClient } from "@/lib/supabase/server";

import type { SkillRegistry } from "../../../../scripts/managed-agents/upload-custom-skills";
import { parseFrontmatter, validateSkillContent } from "./discover-skills";
import { readForkMetadata, writeForkMetadata } from "./fork-metadata";
import {
  ensureUserSkillMetadata,
  getCatalogSkill,
  setSkillInstalledState,
  syncSkillMetadataToCatalog,
} from "./skills-table";

export { validateSkillContent };

const SKILLS_INDEX_PATH = "/skills";
const SKILL_REGISTRY_PATH = path.join(
  process.cwd(),
  "scripts",
  "managed-agents",
  "skill-registry.json",
);

/** Saves a user's customized `SKILL.md` content after validating frontmatter. */
export async function saveSkillContent(
  slug: string,
  content: string,
): Promise<{ success: boolean; error?: string }> {
  const validation = validateSkillContent(content);

  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    const supabase = await createClient();
    const clientId = await resolveClientId(supabase);
    const fileClient = createAgentFileClient(supabase, clientId);
    const metadata = parseFrontmatter(content);

    if (!metadata) {
      return {
        success: false,
        error: "SKILL.md must have valid YAML frontmatter with name and description.",
      };
    }

    await fileClient.uploadFile(`skills/${slug}/SKILL.md`, content);
    await ensureForkMetadataExists(supabase, clientId, slug);
    const catalogSkill = await getCatalogSkill(supabase, slug);

    await ensureUserSkillMetadata(supabase, clientId, {
      slug,
      name: metadata.name,
      description: metadata.description,
      isPredefined: catalogSkill?.is_predefined ?? false,
      forkedFrom: catalogSkill ? slug : null,
    });

    revalidatePath(SKILLS_INDEX_PATH);
    revalidatePath(`${SKILLS_INDEX_PATH}/${slug}`);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/** Deletes the entire user override folder for a skill. */
export async function resetSkillToDefault(
  slug: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const clientId = await resolveClientId(supabase);

    await deleteSkillOverride({ supabase, clientId, slug });
    await syncSkillMetadataToCatalog(supabase, clientId, slug);

    revalidatePath(SKILLS_INDEX_PATH);
    revalidatePath(`${SKILLS_INDEX_PATH}/${slug}`);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function deleteSkillOverride(input: {
  supabase: SupabaseClient;
  clientId: string;
  slug: string;
}): Promise<void> {
  const bucket = input.supabase.storage.from(AGENT_FILES_BUCKET);
  const prefix = `${input.clientId}/skills/${input.slug}`;
  const allPaths = await listAllStoragePaths(bucket, prefix);

  if (allPaths.length === 0) {
    return;
  }

  const { error } = await bucket.remove(allPaths);

  if (error) {
    throw new Error(`Failed to reset skill "${input.slug}": ${error.message}`);
  }
}

async function listAllStoragePaths(
  bucket: ReturnType<SupabaseClient["storage"]["from"]>,
  prefix: string,
): Promise<string[]> {
  const { data: entries, error } = await bucket.list(prefix);

  if (error || !entries) {
    throw new Error(`Failed to list storage path "${prefix}": ${error?.message ?? "Unknown storage error."}`);
  }

  const files: string[] = [];

  for (const entry of entries) {
    const childPath = `${prefix}/${entry.name}`;

    if (entry.id === null) {
      files.push(...(await listAllStoragePaths(bucket, childPath)));
      continue;
    }

    files.push(childPath);
  }

  return files;
}

async function ensureForkMetadataExists(
  supabase: SupabaseClient,
  clientId: string,
  slug: string,
): Promise<void> {
  const existingMetadata = await readForkMetadata(supabase, clientId, slug);

  if (existingMetadata !== null) {
    return;
  }

  const registry = JSON.parse(fs.readFileSync(SKILL_REGISTRY_PATH, "utf8")) as SkillRegistry;
  const registryEntry = registry[slug];

  if (!registryEntry) {
    throw new Error(`Unknown skill "${slug}".`);
  }

  await writeForkMetadata(supabase, clientId, slug, {
    forkedFromVersion: registryEntry.latestVersion,
    forkedAt: new Date().toISOString(),
  });
}

/**
 * Marks a predefined skill as installed for the current user.
 */
export async function installSkill(
  slug: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const clientId = await resolveClientId(supabase);

    await setSkillInstalledState(supabase, clientId, slug, true);

    revalidatePath(SKILLS_INDEX_PATH);
    revalidatePath(`${SKILLS_INDEX_PATH}/${slug}`);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Marks a predefined skill as uninstalled for the current user without
 * deleting any customized storage overrides.
 */
export async function uninstallSkill(
  slug: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const clientId = await resolveClientId(supabase);

    await setSkillInstalledState(supabase, clientId, slug, false);

    revalidatePath(SKILLS_INDEX_PATH);
    revalidatePath(`${SKILLS_INDEX_PATH}/${slug}`);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
