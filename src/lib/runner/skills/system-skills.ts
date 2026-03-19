/**
 * Resolves bundled system skill files from the codebase.
 *
 * System skills live at `src/lib/runner/skills/system/` and are served
 * as a read_file fallback when the agent requests `/agent/skills/system/*`.
 * This avoids per-client seeding — system skills are identical for all clients
 * and versioned with code.
 *
 * @module lib/runner/skills/system-skills
 */
import { readFile } from "fs/promises";

import { getBundledSystemSkillPath } from "./bundled-skill-files";

const SYSTEM_SKILLS_PREFIX = "skills/system/";

/**
 * Whether a storage-relative path points to a bundled system skill.
 *
 * @param storagePath - Storage-relative path (e.g. `skills/system/creating-connections/SKILL.md`).
 */
export function isSystemSkillPath(storagePath: string): boolean {
  return storagePath.startsWith(SYSTEM_SKILLS_PREFIX);
}

/**
 * Reads a bundled system skill file from the codebase.
 *
 * @param storagePath - Storage-relative path (e.g. `skills/system/creating-connections/SKILL.md`).
 * @returns The markdown content, or `null` if the path is not a system skill or the file doesn't exist.
 */
export async function getSystemSkillContent(
  storagePath: string,
): Promise<string | null> {
  if (!isSystemSkillPath(storagePath)) {
    return null;
  }

  const relativePath = storagePath.slice(SYSTEM_SKILLS_PREFIX.length);

  if (relativePath.includes("..")) {
    return null;
  }

  const filePath = getBundledSystemSkillPath(relativePath);

  if (!filePath) {
    return null;
  }

  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}
