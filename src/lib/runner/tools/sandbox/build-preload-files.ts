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

  // 4. Download chat file attachments (RunnerFilePart from payload.fileParts)
  // Reserve context.json — it is written by createLazyBashTool at sandbox init time
  const usedNames = new Set<string>(["context.json"]);
  for (const part of fileParts) {
    try {
      const buffer = await downloadAttachmentContent(bucket, clientId, part);
      if (!buffer) {
        continue;
      }
      const rawName = part.filename ?? "attachment";
      let safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_");

      // Dedup: append counter suffix on collision
      if (usedNames.has(safeName)) {
        const dot = safeName.lastIndexOf(".");
        const base = dot > 0 ? safeName.slice(0, dot) : safeName;
        const ext = dot > 0 ? safeName.slice(dot) : "";
        let counter = 2;
        while (usedNames.has(`${base}_${counter}${ext}`)) counter++;
        safeName = `${base}_${counter}${ext}`;
      }
      usedNames.add(safeName);

      files.push({ path: `input/${safeName}`, content: buffer });
    } catch (error) {
      console.warn("[sandbox] Attachment download failed (non-fatal):", error);
    }
  }

  return files;
}

/**
 * Downloads a chat attachment from Supabase Storage when a durable path is
 * available, then falls back to the transient signed URL for legacy payloads.
 */
async function downloadAttachmentContent(
  bucket: StorageBucket,
  clientId: string,
  part: RunnerFilePart,
): Promise<Buffer | null> {
  if (part.storagePath) {
    const { data, error } = await bucket.download(`${clientId}/${part.storagePath}`);
    if (data) {
      return Buffer.from(await data.arrayBuffer());
    }

    console.warn(
      `[sandbox] Attachment storage download failed: ${error?.message ?? "unknown error"} for ${part.storagePath}`,
    );
  }

  const response = await fetch(part.url);
  if (!response.ok) {
    console.warn(`[sandbox] Attachment fetch failed: ${response.status} for ${part.filename ?? part.url}`);
    return null;
  }

  return Buffer.from(await response.arrayBuffer());
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
