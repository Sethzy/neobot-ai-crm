/**
 * Seeds predefined managed-agent skills into the `public.skills` metadata
 * table. This is the deploy-time bridge between repo-owned skill bundles and
 * the per-user install/discovery layer.
 *
 * Usage:
 *   pnpm tsx scripts/managed-agents/seed-skills-table.ts
 *
 * @module scripts/managed-agents/seed-skills-table
 */
import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/env";
import type { Database } from "@/types/database";

import { readSkillBundle } from "./read-skill-bundle";

const SKILLS_DIR = path.join(process.cwd(), "managed-agents", "skills");

type ServiceSupabaseClient = ReturnType<typeof createClient<Database>>;

interface CatalogSkillRow {
  slug: string;
  name: string;
  description: string;
  is_predefined: boolean;
  is_installed: boolean;
}

async function loadCatalogRows(): Promise<CatalogSkillRow[]> {
  const bundleDirs = fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(SKILLS_DIR, entry.name))
    .sort((left, right) => left.localeCompare(right));

  const rows: CatalogSkillRow[] = [];

  for (const bundleDir of bundleDirs) {
    const bundle = await readSkillBundle(bundleDir);
    rows.push({
      slug: bundle.slug,
      name: bundle.frontmatter.name,
      description: bundle.frontmatter.description,
      is_predefined: true,
      is_installed: false,
    });
  }

  return rows;
}

async function syncCatalogRows(
  supabase: ServiceSupabaseClient,
  rows: CatalogSkillRow[],
): Promise<void> {
  const { data: existingRows, error: selectError } = await supabase
    .from("skills")
    .select("id, slug")
    .is("client_id", null);

  if (selectError) {
    throw new Error(`Failed to read existing skills catalog rows: ${selectError.message}`);
  }

  const existingBySlug = new Map((existingRows ?? []).map((row) => [row.slug, row.id]));

  for (const row of rows) {
    const existingId = existingBySlug.get(row.slug);

    if (existingId) {
      const { error: updateError } = await supabase
        .from("skills")
        .update({
          name: row.name,
          description: row.description,
          is_predefined: row.is_predefined,
          is_installed: row.is_installed,
          forked_from: null,
        })
        .eq("id", existingId);

      if (updateError) {
        throw new Error(`Failed to update catalog skill "${row.slug}": ${updateError.message}`);
      }

      continue;
    }

    const { error: insertError } = await supabase
      .from("skills")
      .insert(row);

    if (insertError) {
      throw new Error(`Failed to insert catalog skill "${row.slug}": ${insertError.message}`);
    }
  }

  const desiredSlugs = new Set(rows.map((row) => row.slug));
  const staleIds = (existingRows ?? [])
    .filter((row) => !desiredSlugs.has(row.slug))
    .map((row) => row.id);

  if (staleIds.length === 0) {
    return;
  }

  const { error: deleteError } = await supabase
    .from("skills")
    .delete()
    .in("id", staleIds);

  if (deleteError) {
    throw new Error(`Failed to delete stale catalog skills: ${deleteError.message}`);
  }
}

async function main(): Promise<void> {
  const env = getServerEnv();
  const supabase = createClient<Database>(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const rows = await loadCatalogRows();
  await syncCatalogRows(supabase, rows);

  console.log(`Seeded ${rows.length} predefined skills into public.skills`);
}

if (process.env.VITEST !== "true") {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
