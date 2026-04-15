/**
 * Reads `skill-registry.json` and assembles the Managed Agents `skills` array.
 * All managed-agent skills are uploaded as Anthropic custom skills and loaded
 * from the registry here. Anthropic's per-session 20-skill cap is enforced.
 *
 * @module scripts/managed-agents/load-managed-agent-skills
 */
import fs from "node:fs";

import type { BetaManagedAgentsSkillParams } from "@anthropic-ai/sdk/resources/beta/agents/agents";

import type { SkillRegistry } from "./upload-custom-skills";

const MAX_SKILLS_PER_SESSION = 20;

export function loadManagedAgentSkills(registryPath: string): BetaManagedAgentsSkillParams[] {
  if (!fs.existsSync(registryPath)) {
    throw new Error(
      `skill-registry.json not found at ${registryPath}. Run \`pnpm tsx scripts/managed-agents/upload-custom-skills.ts\` first.`,
    );
  }

  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as SkillRegistry;
  const customSkills: BetaManagedAgentsSkillParams[] = Object.values(registry).map((entry) => ({
    type: "custom",
    skill_id: entry.skillId,
    version: entry.latestVersion,
  }));

  if (customSkills.length > MAX_SKILLS_PER_SESSION) {
    throw new Error(
      `Skill count ${customSkills.length} exceeds the ${MAX_SKILLS_PER_SESSION}-skill per-session cap.`,
    );
  }

  return customSkills;
}
