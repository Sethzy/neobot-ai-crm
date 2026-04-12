"use server";
/**
 * Server actions for the `/skills` dashboard.
 *
 * @module app/(dashboard)/skills/actions
 */
import fs from "node:fs";
import path from "node:path";

import { revalidatePath } from "next/cache";

import { resolveClientId } from "@/lib/chat/client-id";
import {
  duplicateSkill,
  overwriteSkillFromPredefined,
} from "@/lib/runner/skills/duplicate-skill";
import { writeForkMetadata } from "@/lib/runner/skills/fork-metadata";
import { resetSkillToDefault } from "@/lib/runner/skills/skill-actions";
import { createClient } from "@/lib/supabase/server";

import type { SkillRegistry } from "../../../scripts/managed-agents/upload-custom-skills";

const BUNDLE_ROOT = path.join(process.cwd(), "managed-agents", "skills");
const REGISTRY_PATH = path.join(process.cwd(), "scripts", "managed-agents", "skill-registry.json");

function getRegistry(): SkillRegistry {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8")) as SkillRegistry;
}

function revalidateSkillRoutes(slug: string): void {
  revalidatePath("/skills");
  revalidatePath(`/skills/${slug}`);
}

export async function duplicateSkillAction(slug: string): Promise<void> {
  const supabase = await createClient();
  const clientId = await resolveClientId(supabase);

  await duplicateSkill({
    supabase,
    clientId,
    slug,
    bundleRoot: BUNDLE_ROOT,
    registryPath: REGISTRY_PATH,
  });

  revalidateSkillRoutes(slug);
}

export async function resetSkillAction(slug: string): Promise<void> {
  const result = await resetSkillToDefault(slug);

  if (!result.success) {
    throw new Error(result.error ?? `Failed to reset skill "${slug}".`);
  }

  revalidateSkillRoutes(slug);
}

export async function acknowledgeForkAction(slug: string): Promise<void> {
  const supabase = await createClient();
  const clientId = await resolveClientId(supabase);
  const entry = getRegistry()[slug];

  if (!entry) {
    throw new Error(`Unknown skill "${slug}".`);
  }

  await writeForkMetadata(supabase, clientId, slug, {
    forkedFromVersion: entry.latestVersion,
    forkedAt: new Date().toISOString(),
  });

  revalidateSkillRoutes(slug);
}

export async function overwriteForkAction(slug: string): Promise<void> {
  const supabase = await createClient();
  const clientId = await resolveClientId(supabase);

  await overwriteSkillFromPredefined({
    supabase,
    clientId,
    slug,
    bundleRoot: BUNDLE_ROOT,
    registryPath: REGISTRY_PATH,
  });

  revalidateSkillRoutes(slug);
}
