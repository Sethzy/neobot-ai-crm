/**
 * Shared Supabase Storage helpers for memory files.
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

/** Supabase storage error status codes that indicate a missing object. */
const MISSING_STATUS_CODES = new Set(["nosuchkey", "objectnotfound", "notfound"]);

/** Supabase storage error status codes that indicate a conflict (already exists). */
const CONFLICT_STATUS_CODES = new Set(["resourcealreadyexists", "alreadyexists"]);

interface ParsedStorageError {
  status: number | undefined;
  statusCode: string | undefined;
  message: string | undefined;
}

/** Extracts numeric status, lowercase statusCode, and message from an unknown storage error. */
function parseStorageError(error: unknown): ParsedStorageError {
  if (typeof error !== "object" || error === null) {
    return { status: undefined, statusCode: undefined, message: undefined };
  }

  const e = error as { status?: unknown; statusCode?: unknown; message?: unknown };

  let status: number | undefined;
  if (typeof e.status === "number") {
    status = e.status;
  } else if (typeof e.statusCode === "string") {
    const parsed = Number.parseInt(e.statusCode, 10);
    if (!Number.isNaN(parsed)) status = parsed;
  }

  const statusCode = typeof e.statusCode === "string" ? e.statusCode.toLowerCase() : undefined;
  const message = typeof e.message === "string" ? e.message : undefined;

  return { status, statusCode, message };
}

export function isMissingStorageObjectError(error: unknown): boolean {
  const { status, statusCode } = parseStorageError(error);
  return status === 404 || MISSING_STATUS_CODES.has(statusCode ?? "");
}

export function isStorageConflictError(error: unknown): boolean {
  const { status, statusCode, message } = parseStorageError(error);
  if (status === 409 || CONFLICT_STATUS_CODES.has(statusCode ?? "")) return true;
  return message?.toLowerCase().includes("already exists") ?? false;
}

export function getStorageErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  const { message } = parseStorageError(error);
  return message ?? String(error);
}

/** Builds client-scoped storage path: `{clientId}/{path}`. */
export function getStoragePath(clientId: string, path: string): string {
  return `${clientId}/${path}`;
}

/** Decodes a Supabase Storage download payload (Blob, text()-able, or string) to UTF-8 text. */
export async function decodeStorageTextPayload(
  payload: unknown,
  path: string,
): Promise<string> {
  if (typeof payload === "string") return payload;

  if (
    typeof payload === "object"
    && payload !== null
    && "text" in payload
    && typeof (payload as { text: unknown }).text === "function"
  ) {
    return (payload as { text: () => Promise<string> }).text();
  }

  throw new Error(`unsupported payload for ${path}`);
}

/**
 * Downloads and decodes a memory file from Storage.
 *
 * Returns `{ kind: "missing" }` for 404s, throws on other errors.
 * Works for any path (root or topic).
 */
export async function downloadMemoryFile(
  supabase: SupabaseClient,
  clientId: string,
  path: string,
): Promise<MemoryFileReadResult> {
  const storagePath = getStoragePath(clientId, path);
  const { data, error } = await supabase.storage
    .from(MEMORY_BUCKET_ID)
    .download(storagePath);

  if (error) {
    if (isMissingStorageObjectError(error)) return { kind: "missing" };
    throw new Error(`Failed to read memory file "${path}": ${getStorageErrorMessage(error)}`);
  }

  if (!data) return { kind: "missing" };

  const content = await decodeStorageTextPayload(data, path);
  return { kind: "found", content };
}

/**
 * Typed wrapper around `downloadMemoryFile` for root memory files.
 */
export async function readMemoryRootFile(
  supabase: SupabaseClient,
  clientId: string,
  path: MemoryRootPath,
): Promise<MemoryFileReadResult> {
  return downloadMemoryFile(supabase, clientId, path);
}
