/**
 * Reads the predefined managed-agent skill catalog once at module load and
 * exposes the stable slug list for install-state comparisons during kickoff.
 *
 * @module lib/runner/skills/list-catalog-skill-slugs
 */
import fs from "node:fs";
import path from "node:path";

import type { SkillRegistry } from "../../../../scripts/managed-agents/upload-custom-skills";

const SKILL_REGISTRY_PATH = path.join(
  process.cwd(),
  "scripts",
  "managed-agents",
  "skill-registry.json",
);

const CATALOG_SKILL_SLUGS = (() => {
  const registry = JSON.parse(
    fs.readFileSync(SKILL_REGISTRY_PATH, "utf8"),
  ) as SkillRegistry;

  return Object.keys(registry).sort((left, right) => left.localeCompare(right));
})();

export function listCatalogSkillSlugs(): string[] {
  return [...CATALOG_SKILL_SLUGS];
}
