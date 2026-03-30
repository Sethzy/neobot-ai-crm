/**
 * Types for Vercel Sandbox integration.
 * @module lib/runner/tools/sandbox/types
 */

/** A file to preload into the sandbox before the first bash command. */
export interface SandboxPreloadFile {
  /** Path relative to /vercel/sandbox/workspace (e.g., "input/deals.xlsx"). */
  path: string;
  /** File content as a Buffer. */
  content: Buffer;
}

/** A captured tool result entry for serialization into context.json. */
export interface SandboxContextEntry {
  toolCallId: string;
  toolName: string;
  input: unknown;
  output: unknown;
}

/** A file synced from sandbox agent/home/ back to Supabase Storage. */
export interface SyncedArtifact {
  /** Path relative to agent/home/ (e.g., "rental-analysis.xlsx"). */
  relativePath: string;
  /** Signed download URL from Supabase Storage. */
  downloadUrl: string;
  /** Inferred MIME type. */
  contentType: string;
  /** File size in bytes. */
  sizeBytes: number;
}
