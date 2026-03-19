/**
 * User instruction skill discovery helpers.
 * @module lib/runner/skills/discover-skills
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { parse as parseYaml } from "yaml";

import { MEMORY_BUCKET_ID } from "@/lib/memory/constants";
import { toModelPath } from "@/lib/storage/agent-paths";

const SKILLS_DIRECTORY = "skills";
const EXCLUDED_SKILL_DIRS = new Set(["system", "connections"]);

/** Lightweight metadata exposed to the model before loading a full skill file. */
export interface SkillMetadata {
  slug: string;
  name: string;
  description: string;
  path: string;
}

/**
 * Parses YAML frontmatter from a SKILL.md file.
 *
 * Returns `null` when frontmatter is missing, malformed, or incomplete.
 */
export function parseFrontmatter(
  content: string,
): { name: string; description: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);

  if (!match?.[1]) {
    return null;
  }

  try {
    const parsed = parseYaml(match[1]);

    if (
      typeof parsed?.name !== "string"
      || parsed.name.trim().length === 0
      || typeof parsed?.description !== "string"
      || parsed.description.trim().length === 0
    ) {
      return null;
    }

    return {
      name: parsed.name.trim(),
      description: parsed.description.trim(),
    };
  } catch {
    return null;
  }
}

/**
 * Discovers user-authored skills stored under `/{clientId}/skills/{slug}/SKILL.md`.
 *
 * System and connection skill directories are excluded because they are handled
 * by separate subsystems.
 */
export async function discoverUserSkills(
  supabase: SupabaseClient,
  clientId: string,
): Promise<SkillMetadata[]> {
  const bucket = supabase.storage.from(MEMORY_BUCKET_ID);
  const { data: entries, error } = await bucket.list(`${clientId}/${SKILLS_DIRECTORY}`);

  if (error || !entries) {
    return [];
  }

  const skillDirs = entries
    .map((entry) => entry.name)
    .filter((name) => !EXCLUDED_SKILL_DIRS.has(name));

  if (skillDirs.length === 0) {
    return [];
  }

  const skills = await Promise.all(
    skillDirs.map(async (slug): Promise<SkillMetadata | null> => {
      try {
        const { data, error: downloadError } = await bucket.download(
          `${clientId}/${SKILLS_DIRECTORY}/${slug}/SKILL.md`,
        );

        if (downloadError || !data || typeof data.text !== "function") {
          return null;
        }

        const content = await data.text();
        const metadata = parseFrontmatter(content);

        if (!metadata) {
          return null;
        }

        return {
          slug,
          name: metadata.name,
          description: metadata.description,
          path: toModelPath(`${SKILLS_DIRECTORY}/${slug}/SKILL.md`),
        };
      } catch {
        return null;
      }
    }),
  );

  return skills
    .filter((skill): skill is SkillMetadata => skill !== null)
    .sort((left, right) => left.slug.localeCompare(right.slug));
}
