/**
 * Loads user-authored skill files from Supabase Storage for sandbox execution.
 * @module lib/sandbox/skill-loader
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { MEMORY_BUCKET_ID } from "@/lib/memory/constants";

import type { SpriteSkillFile } from "./types";

interface StorageListEntry {
  name: string;
  id: string | null;
}

/**
 * Loads one skill directory into Sprite-relative `{ path, content }` records.
 */
export async function loadSkillFilesForSandbox(
  supabase: SupabaseClient,
  clientId: string,
  skillSlug: string,
): Promise<SpriteSkillFile[]> {
  const basePath = `${clientId}/skills/${skillSlug}`;
  const bucket = supabase.storage.from(MEMORY_BUCKET_ID);
  const { data: entries, error } = await bucket.list(basePath);

  if (error) {
    throw new Error(`Failed to list sandbox skill directory "${basePath}": ${error.message}`);
  }

  if (!entries || entries.length === 0) {
    return [];
  }

  const files: SpriteSkillFile[] = [];

  for (const entry of entries as StorageListEntry[]) {
    if (entry.name === ".emptyFolderPlaceholder") {
      continue;
    }

    if (entry.id === null || !entry.name.includes(".")) {
      const nestedFiles = await loadNestedSkillFiles(bucket, basePath, skillSlug, entry.name);
      files.push(...nestedFiles);
      continue;
    }

    const content = await downloadFileAsString(bucket, `${basePath}/${entry.name}`);
    files.push({
      path: `${skillSlug}/${entry.name}`,
      content,
    });
  }

  return files;
}

async function loadNestedSkillFiles(
  bucket: ReturnType<SupabaseClient["storage"]["from"]>,
  basePath: string,
  skillSlug: string,
  directoryName: string,
): Promise<SpriteSkillFile[]> {
  const directoryPath = `${basePath}/${directoryName}`;
  const { data: nestedEntries, error } = await bucket.list(directoryPath);

  if (error) {
    throw new Error(`Failed to list sandbox skill directory "${directoryPath}": ${error.message}`);
  }

  if (!nestedEntries || nestedEntries.length === 0) {
    return [];
  }

  const files: SpriteSkillFile[] = [];

  for (const entry of nestedEntries as StorageListEntry[]) {
    if (entry.id === null || entry.name === ".emptyFolderPlaceholder") {
      continue;
    }

    const content = await downloadFileAsString(bucket, `${directoryPath}/${entry.name}`);
    files.push({
      path: `${skillSlug}/${directoryName}/${entry.name}`,
      content,
    });
  }

  return files;
}

async function downloadFileAsString(
  bucket: ReturnType<SupabaseClient["storage"]["from"]>,
  path: string,
): Promise<string> {
  const { data, error } = await bucket.download(path);

  if (error || !data) {
    throw new Error(
      `Failed to download sandbox skill file "${path}": ${error?.message ?? "unknown error"}`,
    );
  }

  if (typeof data === "string") {
    return data;
  }

  if (
    typeof data === "object"
    && data !== null
    && "text" in data
    && typeof data.text === "function"
  ) {
    return data.text();
  }

  if (
    typeof data === "object"
    && data !== null
    && "arrayBuffer" in data
    && typeof data.arrayBuffer === "function"
  ) {
    const buffer = await data.arrayBuffer();
    return Buffer.from(buffer).toString("utf8");
  }

  throw new Error(`Failed to read sandbox skill file "${path}": unsupported payload.`);
}
