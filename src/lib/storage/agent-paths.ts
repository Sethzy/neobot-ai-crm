/**
 * Model-boundary path translation for the /agent/ virtual root.
 *
 * The model sees all agent file paths as absolute (for example
 * `/agent/memory/MEMORY.md`). Internal storage, database rows, and APIs keep
 * using relative paths (for example `memory/MEMORY.md`). These helpers keep the
 * translation logic in one place at the model boundary.
 *
 * @module lib/storage/agent-paths
 */

/** Virtual root that the model sees for all agent file operations. */
export const AGENT_ROOT = "/agent/";

/**
 * Strips the `/agent/` prefix to get an internal storage-relative path.
 *
 * Relative inputs pass through unchanged for backwards compatibility during the
 * transition to canonical absolute model paths.
 */
export function toStoragePath(modelPath: string): string {
  if (modelPath.startsWith(AGENT_ROOT)) {
    return modelPath.slice(AGENT_ROOT.length);
  }

  return modelPath;
}

/**
 * Adds the `/agent/` prefix so the model always sees absolute paths.
 *
 * This is idempotent. Paths that are already absolute under `/agent/` are
 * returned unchanged.
 */
export function toModelPath(storagePath: string): string {
  if (storagePath.startsWith(AGENT_ROOT)) {
    return storagePath;
  }

  return `${AGENT_ROOT}${storagePath}`;
}
