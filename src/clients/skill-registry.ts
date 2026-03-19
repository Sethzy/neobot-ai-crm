/**
 * @file DocGen skill registry
 * @deprecated This entire module is deprecated. The hardcoded registry + direct Anthropic
 * Skills API approach is being replaced by:
 * - Vercel Sandbox + Claude Code CLI for Excel generation (see docs/product/designs/sandbox-skill-execution.md)
 * - Per-client SKILL.md files in Supabase Storage for user preferences (see docs/product/designs/instruction-skills.md)
 * - Anthropic's xlsx skill baked into the sandbox snapshot instead of referenced via skill_id
 *
 * Do not add new entries. Will be removed when sandbox execution ships.
 *
 * @description Maps client IDs to their uploaded Claude API skill IDs.
 * Updated manually after uploading skills via Claude Skills API.
 */

/**
 * Registry mapping client config IDs to their Claude API skill IDs.
 * null = no custom skill (uses generic prompts only)
 */
export const docgenSkillRegistry: Record<string, string | null> = {
  default: null, // No custom skill - uses generic prompts
  "hoh-law": "skill_014MCHbuRqzRdh9bsURwh72X",
};

/**
 * Get the Claude API skill_id for a client's DocGen skill.
 * Returns null if no custom skill is configured.
 *
 * @param clientId - Client config ID (e.g., "hoh-law")
 * @returns Skill ID string or null
 */
export function getDocgenSkillId(clientId: string): string | null {
  return docgenSkillRegistry[clientId] ?? null;
}
