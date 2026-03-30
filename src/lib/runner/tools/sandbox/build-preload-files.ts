/**
 * Assembles all files to preload into the sandbox before the first bash call.
 *
 * Pattern cloned from call-summary-agent's `generateFilesForSandbox()` in
 * `lib/sandbox-context.ts` — adapted for Sunder's Supabase Storage backend.
 *
 * @module lib/runner/tools/sandbox/build-preload-files
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { MEMORY_BUCKET_ID } from "@/lib/memory/constants";

import type { SandboxPreloadFile } from "./types";

const SKILLS_DIRECTORY = "skills";
const EXCLUDED_SKILL_DIRS = new Set(["system", "connections", "superpowers"]);

export interface BuildPreloadFilesOptions {
  supabase: SupabaseClient;
  clientId: string;
}

type StorageBucket = ReturnType<SupabaseClient["storage"]["from"]>;

/**
 * Recursively downloads all files under a Supabase Storage prefix.
 *
 * @param bucket - Supabase Storage bucket reference.
 * @param storagePrefix - Full storage path prefix (e.g., "client-1/uploads").
 * @param outputPrefix - Sandbox-relative path prefix (e.g., "agent/uploads").
 */
export async function downloadStorageDirectory(
  bucket: StorageBucket,
  storagePrefix: string,
  outputPrefix: string,
): Promise<SandboxPreloadFile[]> {
  const PAGE_SIZE = 100;

  /** Lists all entries under a prefix, paginating past Supabase's 100-item default. */
  async function listAll(prefix: string) {
    const allEntries: { name: string; id: string | null }[] = [];
    let offset = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data: page } = await bucket.list(prefix, { limit: PAGE_SIZE, offset });
      if (!page || page.length === 0) break;
      allEntries.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    return allEntries;
  }

  async function walk(
    currentPrefix: string,
    relativePath: string,
  ): Promise<SandboxPreloadFile[]> {
    const entries = await listAll(currentPrefix);
    if (entries.length === 0) return [];

    const results = await Promise.all(
      entries.map(async (entry: { name: string; id: string | null }) => {
        const fullPath = `${currentPrefix}/${entry.name}`;
        const relPath = relativePath
          ? `${relativePath}/${entry.name}`
          : entry.name;

        if (entry.id === null) {
          return walk(fullPath, relPath);
        }

        const { data } = await bucket.download(fullPath);
        if (!data) return [];

        const buffer = Buffer.from(await data.arrayBuffer());
        return [{ path: `${outputPrefix}/${relPath}`, content: buffer }];
      }),
    );

    return results.flat();
  }

  return walk(storagePrefix, "");
}

/**
 * Builds the complete list of files to preload into the sandbox.
 *
 * Three categories:
 * 1. User-authored skill directories → `skills/{slug}/...`
 * 2. Uploaded files → `agent/uploads/...`
 * 3. Persistent home files → `agent/home/...`
 *
 * Note: context.json is NOT built here. It is owned by createLazyBashTool
 * which has access to the latest tool results via getContextEntries().
 */
export async function buildPreloadFiles(
  options: BuildPreloadFilesOptions,
): Promise<SandboxPreloadFile[]> {
  const { supabase, clientId } = options;
  const bucket = supabase.storage.from(MEMORY_BUCKET_ID);
  const files: SandboxPreloadFile[] = [];

  // 1. Download all user skill directories
  const { data: skillDirs } = await bucket.list(`${clientId}/${SKILLS_DIRECTORY}`);
  if (skillDirs) {
    const slugs = skillDirs
      .filter((e: { id: string | null }) => e.id === null)
      .map((e: { name: string }) => e.name)
      .filter((name: string) => !EXCLUDED_SKILL_DIRS.has(name));

    const skillFiles = await Promise.all(
      slugs.map((slug: string) =>
        downloadStorageDirectory(bucket, `${clientId}/${SKILLS_DIRECTORY}/${slug}`, `${SKILLS_DIRECTORY}/${slug}`),
      ),
    );
    files.push(...skillFiles.flat());
  }

  // 2. Download all files from uploads/
  const uploadFiles = await downloadStorageDirectory(
    bucket, `${clientId}/uploads`, "agent/uploads",
  );
  files.push(...uploadFiles);

  // 3. Download all files from home/
  const homeFiles = await downloadStorageDirectory(
    bucket, `${clientId}/home`, "agent/home",
  );
  files.push(...homeFiles);

  return files;
}

/**
 * Generates an ASCII file tree for extraInstructions.
 *
 * Cloned from call-summary-agent's `generateFileTree()` in `lib/sandbox-context.ts`.
 */
export function generateFileTree(files: SandboxPreloadFile[]): string {
  const paths = files.map((f) => f.path).sort();
  if (paths.length === 0) return "(no files)";

  const lines: string[] = [];
  for (const filePath of paths) {
    const depth = filePath.split("/").length - 1;
    const indent = "  ".repeat(depth);
    const name = filePath.split("/").pop()!;
    lines.push(`${indent}${name}`);
  }
  return lines.join("\n");
}

/**
 * Generates a compact directory summary for extraInstructions.
 *
 * Contract:
 * - agent/uploads/ (N files) — total files under agent/uploads/
 * - agent/home/ (N files) — total files under agent/home/
 * - skills/ (N skills) — count of top-level skill directories
 * - input/context.json — listed explicitly
 * - Empty directories omitted
 * - Individual filenames never listed
 */
export function generateFileSummary(files: SandboxPreloadFile[]): string {
  if (files.length === 0) return "(no files)";

  let uploadCount = 0;
  let homeCount = 0;
  const skillSlugs = new Set<string>();
  const explicitFiles: string[] = [];

  for (const file of files) {
    if (file.path.startsWith("agent/uploads/")) {
      uploadCount++;
    } else if (file.path.startsWith("agent/home/")) {
      homeCount++;
    } else if (file.path.startsWith("skills/")) {
      const slug = file.path.split("/")[1];
      if (slug) skillSlugs.add(slug);
    } else {
      explicitFiles.push(file.path);
    }
  }

  const lines: string[] = [];
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  if (uploadCount > 0) lines.push(`  agent/uploads/ (${plural(uploadCount, "file")})`);
  if (homeCount > 0) lines.push(`  agent/home/ (${plural(homeCount, "file")})`);
  if (skillSlugs.size > 0) lines.push(`  skills/ (${plural(skillSlugs.size, "skill")})`);
  for (const f of explicitFiles.sort()) lines.push(`  ${f}`);

  return lines.join("\n");
}
