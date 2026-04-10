/**
 * Supabase Storage error helpers shared across agent-file callers.
 *
 * These are deliberately framework-agnostic — no dependency on any specific
 * bucket or entity. The `src/lib/memory` module previously owned them; they
 * were re-homed here in H1 so that deleting the memory system (D2) does not
 * break sandbox, skill, or runner storage callers.
 *
 * @module lib/storage/storage-errors
 */

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
