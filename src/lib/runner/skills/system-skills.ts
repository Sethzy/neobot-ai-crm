/**
 * Resolves bundled system skill content from inlined string constants.
 *
 * System skills are served as a read_file fallback when the agent requests
 * `/agent/skills/system/*`. Content is inlined in skill-templates.ts
 * (same pattern as memory/templates.ts) so it works in Next.js bundles.
 *
 * @module lib/runner/skills/system-skills
 */
import { SYSTEM_SKILL_CONTENT } from "./skill-templates";

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
 * Returns bundled system skill content from inlined constants.
 *
 * @param storagePath - Storage-relative path (e.g. `skills/system/creating-connections/SKILL.md`).
 * @returns The markdown content, or `null` if the path is not a system skill or doesn't exist.
 */
export function getSystemSkillContent(
  storagePath: string,
): string | null {
  if (!isSystemSkillPath(storagePath)) {
    return null;
  }

  const relativePath = storagePath.slice(SYSTEM_SKILLS_PREFIX.length);

  if (relativePath.includes("..")) {
    return null;
  }

  return SYSTEM_SKILL_CONTENT[relativePath] ?? null;
}
