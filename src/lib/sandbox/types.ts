/**
 * Shared types for Sprite-backed sandbox execution.
 * @module lib/sandbox/types
 */

/** Persisted row shape for the per-thread Sprite session table. */
export interface SpriteSessionRow {
  id: string;
  client_id: string;
  thread_id: string;
  sprite_name: string;
  status: "running" | "sleeping" | "destroyed";
  preview_url: string | null;
  created_at: string;
  last_active_at: string;
  destroyed_at: string | null;
}

/** File content loaded from Supabase Storage and written into the Sprite filesystem. */
export interface SpriteSkillFile {
  path: string;
  content: string;
}

/** One uploaded artifact produced by the Sprite and re-uploaded to storage. */
export interface SpriteOutputFile {
  filename: string;
  storagePath: string;
  downloadUrl: string;
  mediaType: string;
}

/** Unified Sprite handle for all sandbox operations (PR 55). */
export interface SpriteHandle {
  name: string;
  execFile: (
    command: string,
    args?: string[],
    options?: { env?: Record<string, string> },
  ) => Promise<{ stdout?: string | Buffer; stderr?: string | Buffer; exitCode?: number }>;
  spawn: (
    command: string,
    args?: string[],
    options?: { detachable?: boolean; env?: Record<string, string> },
  ) => void;
  filesystem: (basePath?: string) => {
    writeFile: (path: string, content: string | Buffer) => Promise<void>;
    readFile: (path: string) => Promise<string | Buffer>;
  };
}

/** Execution result returned after Claude completes work inside a Sprite. */
export interface SpriteResult {
  success: boolean;
  summary: string;
  spriteName: string;
  outputFiles: SpriteOutputFile[];
  cliOutput?: string;
  error?: string;
}
