/**
 * Reads the raw `SKILL.md` for a predefined managed-agent skill bundle.
 *
 * @module lib/runner/skills/read-predefined-skill
 */
import path from "node:path";

import { readSkillBundle } from "../../../../scripts/managed-agents/read-skill-bundle";

/**
 * Returns the full `SKILL.md` content for a predefined skill slug, including
 * YAML frontmatter. Returns `null` when the slug is unknown.
 */
export async function readPredefinedSkillContent(
  slug: string,
): Promise<string | null> {
  try {
    const bundleRoot = path.join(process.cwd(), "managed-agents", "skills");
    const bundle = await readSkillBundle(path.join(bundleRoot, slug));
    return bundle.files.find((file) => file.relativePath.endsWith("SKILL.md"))?.content ?? null;
  } catch {
    return null;
  }
}
