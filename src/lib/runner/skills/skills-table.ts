/**
 * Query and mutation helpers for the `public.skills` metadata table.
 *
 * The skills table is the discovery/install state layer for managed-agent
 * skills. Predefined catalog rows live at `client_id IS NULL`; per-user rows
 * mirror the installed state and any customized metadata for that client.
 *
 * @module lib/runner/skills/skills-table
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { DEFAULT_INSTALLED_SKILL_SLUGS } from "./default-installed-skills";

type SkillsClient = SupabaseClient<Database>;
type SkillInsert = Database["public"]["Tables"]["skills"]["Insert"];
type SkillRow = Database["public"]["Tables"]["skills"]["Row"];

export interface InstalledSkillSummary {
  slug: string;
  name: string;
  description: string;
}

export interface SkillCatalogSummary extends InstalledSkillSummary {
  isInstalled: boolean;
}

async function listClientSkillRows(
  supabase: SkillsClient,
  clientId: string,
): Promise<Array<Pick<SkillRow, "slug" | "name" | "description" | "is_installed">>> {
  const { data, error } = await supabase
    .from("skills")
    .select("slug, name, description, is_installed")
    .eq("client_id", clientId);

  if (error) {
    throw new Error(`Failed to read client skill rows: ${error.message}`);
  }

  return data ?? [];
}

export async function ensureDefaultInstalledSkills(
  supabase: SkillsClient,
  clientId: string,
): Promise<void> {
  const existingRows = await listClientSkillRows(supabase, clientId);
  const existingSlugs = new Set(existingRows.map((row) => row.slug));
  const missingDefaultSlugs = DEFAULT_INSTALLED_SKILL_SLUGS.filter(
    (slug) => !existingSlugs.has(slug),
  );

  if (missingDefaultSlugs.length === 0) {
    return;
  }

  const { data: catalogRows, error: catalogError } = await supabase
    .from("skills")
    .select("slug, name, description, is_predefined")
    .is("client_id", null)
    .in("slug", [...missingDefaultSlugs]);

  if (catalogError) {
    throw new Error(`Failed to read default skill catalog rows: ${catalogError.message}`);
  }

  const rowsToInsert: SkillInsert[] = (catalogRows ?? []).map((row) => ({
    client_id: clientId,
    slug: row.slug,
    name: row.name,
    description: row.description,
    is_predefined: row.is_predefined,
    is_installed: true,
  }));

  if (rowsToInsert.length === 0) {
    return;
  }

  const { error: insertError } = await supabase
    .from("skills")
    .upsert(rowsToInsert, {
      onConflict: "client_id,slug",
      ignoreDuplicates: true,
    });

  if (insertError) {
    throw new Error(`Failed to bootstrap default installed skills: ${insertError.message}`);
  }
}

export async function getInstalledSkills(
  supabase: SkillsClient,
  clientId: string,
): Promise<InstalledSkillSummary[]> {
  await ensureDefaultInstalledSkills(supabase, clientId);

  const { data, error } = await supabase
    .from("skills")
    .select("slug, name, description")
    .eq("client_id", clientId)
    .eq("is_installed", true)
    .order("name");

  if (error) {
    throw new Error(`Failed to read installed skills: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    slug: row.slug,
    name: row.name,
    description: row.description,
  }));
}

export async function listInstalledSkillSlugs(
  supabase: SkillsClient,
  clientId: string,
): Promise<string[]> {
  await ensureDefaultInstalledSkills(supabase, clientId);

  const { data, error } = await supabase
    .from("skills")
    .select("slug")
    .eq("client_id", clientId)
    .eq("is_installed", true)
    .order("slug");

  if (error) {
    throw new Error(`Failed to read installed skill slugs: ${error.message}`);
  }

  return (data ?? []).map((row) => row.slug);
}

export async function listRecommendedSkills(
  supabase: SkillsClient,
  clientId: string,
): Promise<InstalledSkillSummary[]> {
  const [installedSkills, catalogRowsResult] = await Promise.all([
    getInstalledSkills(supabase, clientId),
    supabase
      .from("skills")
      .select("slug, name, description")
      .is("client_id", null)
      .order("name"),
  ]);

  if (catalogRowsResult.error) {
    throw new Error(`Failed to read skills catalog: ${catalogRowsResult.error.message}`);
  }

  const installedSlugs = new Set(installedSkills.map((skill) => skill.slug));

  return (catalogRowsResult.data ?? [])
    .filter((skill) => !installedSlugs.has(skill.slug))
    .map((skill) => ({
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
    }));
}

export async function getCatalogSkill(
  supabase: SkillsClient,
  slug: string,
): Promise<Pick<SkillRow, "slug" | "name" | "description" | "is_predefined"> | null> {
  const { data, error } = await supabase
    .from("skills")
    .select("slug, name, description, is_predefined")
    .is("client_id", null)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read skill catalog row for "${slug}": ${error.message}`);
  }

  return data;
}

export async function ensureUserSkillMetadata(
  supabase: SkillsClient,
  clientId: string,
  input: {
    slug: string;
    name: string;
    description: string;
    isPredefined: boolean;
    forkedFrom?: string | null;
    isInstalled?: boolean;
  },
): Promise<void> {
  const { data: existingRow, error: existingError } = await supabase
    .from("skills")
    .select("id")
    .eq("client_id", clientId)
    .eq("slug", input.slug)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to read skill "${input.slug}" for metadata sync: ${existingError.message}`);
  }

  if (existingRow) {
    const update: Database["public"]["Tables"]["skills"]["Update"] = {
      name: input.name,
      description: input.description,
      is_predefined: input.isPredefined,
      forked_from: input.forkedFrom ?? null,
    };

    if (typeof input.isInstalled === "boolean") {
      update.is_installed = input.isInstalled;
    }

    const { error: updateError } = await supabase
      .from("skills")
      .update(update)
      .eq("client_id", clientId)
      .eq("slug", input.slug);

    if (updateError) {
      throw new Error(`Failed to update skill "${input.slug}" metadata: ${updateError.message}`);
    }

    return;
  }

  const { error: insertError } = await supabase
    .from("skills")
    .insert({
      client_id: clientId,
      slug: input.slug,
      name: input.name,
      description: input.description,
      is_predefined: input.isPredefined,
      forked_from: input.forkedFrom ?? null,
      is_installed: input.isInstalled ?? false,
    });

  if (insertError) {
    throw new Error(`Failed to insert skill "${input.slug}" metadata: ${insertError.message}`);
  }
}

export async function setSkillInstalledState(
  supabase: SkillsClient,
  clientId: string,
  slug: string,
  isInstalled: boolean,
): Promise<void> {
  const { data: existingRow, error: existingError } = await supabase
    .from("skills")
    .select("slug")
    .eq("client_id", clientId)
    .eq("slug", slug)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to read installed state for skill "${slug}": ${existingError.message}`);
  }

  if (existingRow) {
    const { error: updateError } = await supabase
      .from("skills")
      .update({ is_installed: isInstalled })
      .eq("client_id", clientId)
      .eq("slug", slug);

    if (updateError) {
      throw new Error(`Failed to update installed state for skill "${slug}": ${updateError.message}`);
    }

    return;
  }

  const catalogSkill = await getCatalogSkill(supabase, slug);

  if (!catalogSkill) {
    throw new Error(`Unknown predefined skill "${slug}".`);
  }

  const { error: insertError } = await supabase
    .from("skills")
    .insert({
      client_id: clientId,
      slug: catalogSkill.slug,
      name: catalogSkill.name,
      description: catalogSkill.description,
      is_predefined: catalogSkill.is_predefined,
      is_installed: isInstalled,
    });

  if (insertError) {
    throw new Error(`Failed to set installed state for skill "${slug}": ${insertError.message}`);
  }
}

export async function markSkillAsForkedFromCatalog(
  supabase: SkillsClient,
  clientId: string,
  slug: string,
): Promise<void> {
  const catalogSkill = await getCatalogSkill(supabase, slug);

  if (!catalogSkill) {
    throw new Error(`Unknown predefined skill "${slug}".`);
  }

  await ensureUserSkillMetadata(supabase, clientId, {
    slug,
    name: catalogSkill.name,
    description: catalogSkill.description,
    isPredefined: true,
    forkedFrom: slug,
  });
}

export async function syncSkillMetadataToCatalog(
  supabase: SkillsClient,
  clientId: string,
  slug: string,
): Promise<void> {
  const catalogSkill = await getCatalogSkill(supabase, slug);

  if (!catalogSkill) {
    return;
  }

  await ensureUserSkillMetadata(supabase, clientId, {
    slug,
    name: catalogSkill.name,
    description: catalogSkill.description,
    isPredefined: catalogSkill.is_predefined,
    forkedFrom: null,
  });
}
