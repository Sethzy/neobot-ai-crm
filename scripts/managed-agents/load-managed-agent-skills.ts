/**
 * Reads `skill-registry.json` and assembles the Managed Agents `skills` array.
 * Merges the 4 built-in Anthropic document skills with every custom Sunder
 * skill from the registry and enforces Anthropic's per-session 20-skill cap.
 *
 * @module scripts/managed-agents/load-managed-agent-skills
 */
import fs from "node:fs";

import type { BetaManagedAgentsSkillParams } from "@anthropic-ai/sdk/resources/beta/agents/agents";

import type { SkillRegistry } from "./upload-custom-skills";

const BUILTIN_SKILLS: BetaManagedAgentsSkillParams[] = [
  { type: "anthropic", skill_id: "xlsx" },
  { type: "anthropic", skill_id: "docx" },
  { type: "anthropic", skill_id: "pptx" },
  { type: "anthropic", skill_id: "pdf" },
];

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

  const combinedSkills = [...BUILTIN_SKILLS, ...customSkills];

  if (combinedSkills.length > MAX_SKILLS_PER_SESSION) {
    throw new Error(
      `Combined skill count ${combinedSkills.length} exceeds the ${MAX_SKILLS_PER_SESSION}-skill per-session cap.`,
    );
  }

  return combinedSkills;
}
