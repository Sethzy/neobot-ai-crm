/**
 * Lists metadata for predefined skill bundles authored in the repo and
 * registered with Anthropic.
 *
 * @module lib/runner/skills/list-predefined-skills
 */
import fs from "node:fs";
import path from "node:path";

import { readSkillBundle } from "../../../../scripts/managed-agents/read-skill-bundle";
import type { SkillRegistry } from "../../../../scripts/managed-agents/upload-custom-skills";

export interface PredefinedSkillSummary {
  slug: string;
  name: string;
  description: string;
  latestVersion: string;
  skillId: string;
}

export async function listPredefinedSkills(input: {
  bundleRoot: string;
  registryPath: string;
}): Promise<PredefinedSkillSummary[]> {
  const registry = JSON.parse(fs.readFileSync(input.registryPath, "utf8")) as SkillRegistry;
  const summaries: PredefinedSkillSummary[] = [];

  for (const slug of Object.keys(registry).sort((left, right) => left.localeCompare(right))) {
    const bundle = await readSkillBundle(path.join(input.bundleRoot, slug));
    const registryEntry = registry[slug]!;

    summaries.push({
      slug,
      name: bundle.frontmatter.name,
      description: bundle.frontmatter.description,
      latestVersion: registryEntry.latestVersion,
      skillId: registryEntry.skillId,
    });
  }

  return summaries;
}
