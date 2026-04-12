/**
 * Copies a predefined skill bundle into a user's storage namespace so they can
 * edit it independently of the predefined Anthropic-hosted version.
 *
 * @module lib/runner/skills/duplicate-skill
 */
import fs from "node:fs";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AGENT_FILES_BUCKET,
  AGENT_FILES_TEXT_CONTENT_TYPE,
} from "@/lib/storage/agent-files";

import { readSkillBundle } from "../../../../scripts/managed-agents/read-skill-bundle";
import type { SkillRegistry } from "../../../../scripts/managed-agents/upload-custom-skills";

import { forkMetadataPath } from "./fork-metadata";

export interface DuplicateSkillInput {
  supabase: SupabaseClient;
  clientId: string;
  slug: string;
  /** Absolute path to `managed-agents/skills`. */
  bundleRoot: string;
  /** Absolute path to `scripts/managed-agents/skill-registry.json`. */
  registryPath: string;
}

export async function duplicateSkill(input: DuplicateSkillInput): Promise<void> {
  const registryEntry = readRegistryEntry(input.registryPath, input.slug);
  const bucket = input.supabase.storage.from(AGENT_FILES_BUCKET);
  const prefix = `${input.clientId}/skills/${input.slug}`;
  const desiredFiles = await buildDesiredFiles(input, registryEntry.latestVersion);

  await syncSkillFolder(bucket, prefix, desiredFiles, { pruneStaleFiles: false });
}

export async function overwriteSkillFromPredefined(
  input: DuplicateSkillInput,
): Promise<void> {
  const registryEntry = readRegistryEntry(input.registryPath, input.slug);
  const bucket = input.supabase.storage.from(AGENT_FILES_BUCKET);
  const prefix = `${input.clientId}/skills/${input.slug}`;
  const desiredFiles = await buildDesiredFiles(input, registryEntry.latestVersion);

  await syncSkillFolder(bucket, prefix, desiredFiles, { pruneStaleFiles: true });
}

function readRegistryEntry(registryPath: string, slug: string) {
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as SkillRegistry;
  const registryEntry = registry[slug];

  if (!registryEntry) {
    throw new Error(`Cannot duplicate unknown skill "${slug}".`);
  }

  return registryEntry;
}

type StorageBucket = ReturnType<SupabaseClient["storage"]["from"]>;

interface StoredFile {
  content: string;
  contentType: string;
}

async function buildDesiredFiles(
  input: DuplicateSkillInput,
  latestVersion: string,
): Promise<Map<string, StoredFile>> {
  const bundle = await readSkillBundle(path.join(input.bundleRoot, input.slug));
  const desiredFiles = new Map<string, StoredFile>();

  for (const file of bundle.files) {
    const pathInsideBundle = file.relativePath.startsWith(`${input.slug}/`)
      ? file.relativePath.slice(input.slug.length + 1)
      : file.relativePath;
    const storagePath = `${input.clientId}/skills/${input.slug}/${pathInsideBundle}`;

    desiredFiles.set(storagePath, {
      content: file.content,
      contentType: inferContentType(pathInsideBundle),
    });
  }

  desiredFiles.set(forkMetadataPath(input.clientId, input.slug), {
    content: JSON.stringify(
      {
        forkedFromVersion: latestVersion,
        forkedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    contentType: inferContentType("_fork.json"),
  });

  return desiredFiles;
}

async function syncSkillFolder(
  bucket: StorageBucket,
  prefix: string,
  desiredFiles: Map<string, StoredFile>,
  options: { pruneStaleFiles: boolean },
): Promise<void> {
  const existingFiles = await snapshotSkillFolder(bucket, prefix);

  try {
    for (const [storagePath, file] of desiredFiles) {
      await uploadStoredFile(bucket, storagePath, file);
    }

    if (!options.pruneStaleFiles) {
      return;
    }

    const stalePaths = Array.from(existingFiles.keys()).filter(
      (storagePath) => !desiredFiles.has(storagePath),
    );

    if (stalePaths.length > 0) {
      await removeStoredPaths(
        bucket,
        stalePaths,
        `Failed to remove stale files under "${prefix}".`,
      );
    }
  } catch (error) {
    try {
      await restoreSkillFolder(bucket, prefix, existingFiles);
    } catch (restoreError) {
      const originalMessage =
        error instanceof Error ? error.message : "Unknown overwrite failure";
      const restoreMessage =
        restoreError instanceof Error ? restoreError.message : "Unknown restore failure";
      throw new Error(`${originalMessage} Restore failed: ${restoreMessage}`);
    }

    throw error;
  }
}

async function snapshotSkillFolder(
  bucket: StorageBucket,
  prefix: string,
): Promise<Map<string, StoredFile>> {
  const existingPaths = await listAllStoragePaths(bucket, prefix);
  const snapshot = new Map<string, StoredFile>();

  for (const storagePath of existingPaths) {
    const { data, error } = await bucket.download(storagePath);

    if (error || !data || typeof data.text !== "function") {
      throw new Error(`Failed to snapshot "${storagePath}": ${error?.message ?? "Missing file data."}`);
    }

    snapshot.set(storagePath, {
      content: await data.text(),
      contentType: inferContentType(path.basename(storagePath)),
    });
  }

  return snapshot;
}

async function restoreSkillFolder(
  bucket: StorageBucket,
  prefix: string,
  snapshot: Map<string, StoredFile>,
): Promise<void> {
  const currentPaths = await listAllStoragePaths(bucket, prefix);
  const extraPaths = currentPaths.filter((storagePath) => !snapshot.has(storagePath));

  if (extraPaths.length > 0) {
    await removeStoredPaths(
      bucket,
      extraPaths,
      `Failed to clean up partial files under "${prefix}".`,
    );
  }

  for (const [storagePath, file] of snapshot) {
    await uploadStoredFile(bucket, storagePath, file);
  }
}

async function listAllStoragePaths(
  bucket: StorageBucket,
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

async function uploadStoredFile(
  bucket: StorageBucket,
  storagePath: string,
  file: StoredFile,
): Promise<void> {
  const { error } = await bucket.upload(storagePath, file.content, {
    upsert: true,
    contentType: file.contentType,
  });

  if (error) {
    throw new Error(`Failed to write duplicate file "${storagePath}": ${error.message}`);
  }
}

async function removeStoredPaths(
  bucket: StorageBucket,
  paths: string[],
  failurePrefix: string,
): Promise<void> {
  const { error } = await bucket.remove(paths);

  if (error) {
    throw new Error(`${failurePrefix} ${error.message}`);
  }
}

function inferContentType(relativePath: string): string {
  if (relativePath.endsWith(".md")) {
    return "text/markdown";
  }

  if (relativePath.endsWith(".json")) {
    return "application/json";
  }

  return AGENT_FILES_TEXT_CONTENT_TYPE;
}
