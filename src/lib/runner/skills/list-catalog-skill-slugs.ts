/**
 * Reads the predefined managed-agent skill catalog once at module load and
 * exposes the stable slug list plus lightweight metadata for kickoff assembly.
 *
 * @module lib/runner/skills/list-catalog-skill-slugs
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

import type { SkillRegistry } from "../../../../scripts/managed-agents/upload-custom-skills";

const SKILL_REGISTRY_PATH = path.join(
  process.cwd(),
  "scripts",
  "managed-agents",
  "skill-registry.json",
);

const SKILLS_ROOT = path.join(
  process.cwd(),
  "managed-agents",
  "skills",
);

const EXPLICIT_ONLY_SKILL_SLUGS = new Set(["docx", "pdf", "pptx", "xlsx"]);

export interface CatalogSkillSummary {
  slug: string;
  name: string;
  description: string;
  isExplicitOnly: boolean;
}

function readSkillFrontmatter(skillSlug: string): {
  name: string;
  description: string;
} {
  const skillPath = path.join(SKILLS_ROOT, skillSlug, "SKILL.md");
  const skillContent = fs.readFileSync(skillPath, "utf8");
  const match = skillContent.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);

  if (!match?.[1]) {
    throw new Error(`Skill bundle "${skillSlug}" is missing YAML frontmatter.`);
  }

  const parsed = parseYaml(match[1]) as {
    name?: unknown;
    description?: unknown;
  } | null;

  if (
    typeof parsed?.name !== "string"
    || parsed.name.trim().length === 0
    || typeof parsed.description !== "string"
    || parsed.description.trim().length === 0
  ) {
    throw new Error(
      `Skill bundle "${skillSlug}" must declare non-empty name and description frontmatter.`,
    );
  }

  return {
    name: parsed.name.trim(),
    description: parsed.description.trim(),
  };
}

const CATALOG_SKILLS = (() => {
  const registry = JSON.parse(
    fs.readFileSync(SKILL_REGISTRY_PATH, "utf8"),
  ) as SkillRegistry;

  return Object.keys(registry)
    .sort((left, right) => left.localeCompare(right))
    .map((skillSlug) => {
      const frontmatter = readSkillFrontmatter(skillSlug);

      return {
        slug: skillSlug,
        name: frontmatter.name,
        description: frontmatter.description,
        isExplicitOnly: EXPLICIT_ONLY_SKILL_SLUGS.has(skillSlug),
      } satisfies CatalogSkillSummary;
    });
})();

export function listCatalogSkillSlugs(): string[] {
  return CATALOG_SKILLS.map((skill) => skill.slug);
}

export function listCatalogSkills(): CatalogSkillSummary[] {
  return CATALOG_SKILLS.map((skill) => ({ ...skill }));
}
