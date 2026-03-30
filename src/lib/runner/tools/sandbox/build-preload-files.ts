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
import type { RunnerFilePart } from "@/lib/runner/schemas";

import type { SandboxPreloadFile } from "./types";

const SKILLS_DIRECTORY = "skills";
const EXCLUDED_SKILL_DIRS = new Set(["system", "connections", "superpowers"]);

export interface BuildPreloadFilesOptions {
  supabase: SupabaseClient;
  clientId: string;
  fileParts: RunnerFilePart[];
}

/**
 * Downloads all files in a skill directory recursively from Supabase Storage.
 */
async function downloadSkillDirectory(
  bucket: ReturnType<SupabaseClient["storage"]["from"]>,
  clientId: string,
  slug: string,
): Promise<SandboxPreloadFile[]> {
  const prefix = `${clientId}/${SKILLS_DIRECTORY}/${slug}`;

  async function walk(
    currentPrefix: string,
    relativePath: string,
  ): Promise<SandboxPreloadFile[]> {
    const { data: entries } = await bucket.list(currentPrefix);
    if (!entries) return [];

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
        return [{
          path: `${SKILLS_DIRECTORY}/${slug}/${relPath}`,
          content: buffer,
        }];
      }),
    );

    return results.flat();
  }

  return walk(prefix, "");
}

/**
 * Builds the complete list of files to preload into the sandbox.
 *
 * Two categories:
 * 1. User-authored skill directories → `skills/{slug}/...`
 * 2. Chat attachments → `input/{filename}`
 *
 * Note: context.json is NOT built here. It is owned by createLazyBashTool
 * which has access to the latest tool results via getContextEntries().
 */
export async function buildPreloadFiles(
  options: BuildPreloadFilesOptions,
): Promise<SandboxPreloadFile[]> {
  const { supabase, clientId, fileParts } = options;
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
      slugs.map((slug: string) => downloadSkillDirectory(bucket, clientId, slug)),
    );
    files.push(...skillFiles.flat());
  }

  // 2. Download chat file attachments (RunnerFilePart from payload.fileParts)
  for (const part of fileParts) {
    try {
      const response = await fetch(part.url);
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        const rawName = part.filename ?? "attachment";
        const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_");
        files.push({ path: `input/${safeName}`, content: buffer });
      }
    } catch {
      // Skip failed downloads — non-fatal
    }
  }

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
