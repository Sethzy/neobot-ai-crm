/**
 * Shared Supabase Storage helpers for memory root files.
 * @module lib/memory/storage
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  MEMORY_BUCKET_ID,
  type MemoryRootPath,
} from "./constants";

export type { MemoryRootPath };

export type MemoryFileReadResult =
  | { kind: "missing" }
  | { kind: "found"; content: string };

interface StorageErrorLike {
  message?: string;
  status?: number;
  statusCode?: string;
}

function getStorageErrorLike(error: unknown): StorageErrorLike {
  if (typeof error !== "object" || error === null) {
    return {};
  }

  return error as StorageErrorLike;
}

function getStorageErrorStatus(error: unknown): number | undefined {
  const storageError = getStorageErrorLike(error);

  if (typeof storageError.status === "number") {
    return storageError.status;
  }

  if (typeof storageError.statusCode === "string") {
    const parsedStatus = Number.parseInt(storageError.statusCode, 10);
    if (!Number.isNaN(parsedStatus)) {
      return parsedStatus;
    }
  }

  return undefined;
}

export function isMissingStorageObjectError(error: unknown): boolean {
  const status = getStorageErrorStatus(error);
  if (status === 404) {
    return true;
  }

  const storageError = getStorageErrorLike(error);
  const normalizedStatusCode = storageError.statusCode?.toLowerCase();

  return normalizedStatusCode === "nosuchkey"
    || normalizedStatusCode === "objectnotfound"
    || normalizedStatusCode === "notfound";
}

export function isStorageConflictError(error: unknown): boolean {
  const status = getStorageErrorStatus(error);
  if (status === 409) {
    return true;
  }

  const storageError = getStorageErrorLike(error);
  const normalizedStatusCode = storageError.statusCode?.toLowerCase();

  if (normalizedStatusCode === "resourcealreadyexists" || normalizedStatusCode === "alreadyexists") {
    return true;
  }

  return storageError.message?.toLowerCase().includes("already exists") ?? false;
}

export function getStorageErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  const storageError = getStorageErrorLike(error);
  return storageError.message ?? String(error);
}

function getStoragePath(clientId: string, path: MemoryRootPath): string {
  return `${clientId}/${path}`;
}

export async function decodeStorageTextPayload(
  payload: unknown,
  path: string,
): Promise<string> {
  if (typeof payload === "string") {
    return payload;
  }

  if (
    typeof payload === "object"
    && payload !== null
    && "text" in payload
    && typeof (payload as { text: unknown }).text === "function"
  ) {
    return (payload as { text: () => Promise<string> }).text();
  }

  if (
    typeof payload === "object"
    && payload !== null
    && "arrayBuffer" in payload
    && typeof (payload as { arrayBuffer: unknown }).arrayBuffer === "function"
  ) {
    const buffer = await (payload as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer();
    return new TextDecoder().decode(buffer);
  }

  throw new Error(`unsupported payload for ${path}`);
}

/**
 * Reads a required memory root file directly from Storage with structured error handling.
 */
export async function readMemoryRootFile(
  supabase: SupabaseClient,
  clientId: string,
  path: MemoryRootPath,
): Promise<MemoryFileReadResult> {
  const storagePath = getStoragePath(clientId, path);
  const { data, error } = await supabase.storage
    .from(MEMORY_BUCKET_ID)
    .download(storagePath);

  if (error) {
    if (isMissingStorageObjectError(error)) {
      return { kind: "missing" };
    }

    throw new Error(`Failed to read memory file "${path}": ${getStorageErrorMessage(error)}`);
  }

  if (!data) {
    return { kind: "missing" };
  }

  const content = await decodeStorageTextPayload(data, path);
  return { kind: "found", content };
}
