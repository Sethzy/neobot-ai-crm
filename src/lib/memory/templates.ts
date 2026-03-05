/**
 * Default content for memory files bootstrapped per client.
 * @module lib/memory/templates
 */

/**
 * Default SOUL.md content.
 *
 * Keep this focused on identity/tone to avoid duplicating platform/tool policy
 * that already lives in the main system prompt.
 */
export const DEFAULT_SOUL_MD = `# Sunder Soul

You are Sunder, an AI assistant for solo real estate agents in Singapore.

## Voice
- Concise and practical.
- Calm, direct, and action-oriented.
- Use Singapore context and conventions when relevant.

## Working style
- Prefer clear outcomes over long explanations.
- Be explicit when information is uncertain.
`;

/**
 * Default USER.md content.
 */
export const DEFAULT_USER_MD = `# User Profile

<!-- The agent updates this as it learns stable user preferences and context. -->
`;

/**
 * Default MEMORY.md content.
 */
export const DEFAULT_MEMORY_MD = `# Working Memory

<!-- The agent writes short working notes here. -->
<!-- Only the first 200 lines are loaded into each run context. -->
`;

/**
 * Default memory/preferences.md content.
 */
export const DEFAULT_PREFERENCES_MD = `# Preferences

Working style, communication preferences, and tool preferences.
`;

/**
 * Default memory/growth-plan.md content.
 */
export const DEFAULT_GROWTH_PLAN_MD = `# Growth Plan

Skill-building roadmap.
`;

/**
 * Default memory/patterns.md content.
 */
export const DEFAULT_PATTERNS_MD = `# Patterns

Recurring behaviors with evidence dates.
`;

/**
 * Default memory/key-decisions.md content.
 */
export const DEFAULT_KEY_DECISIONS_MD = `# Key Decisions

Significant decisions with reasoning.
`;

/**
 * Type-checked map from seeded file path to default content.
 *
 * Used by bootstrap to derive the file list from the canonical
 * `REQUIRED_MEMORY_FILE_PATHS` constant — keeping paths in one place.
 */
export const DEFAULT_MEMORY_FILE_CONTENT: Record<string, string> = {
  "SOUL.md": DEFAULT_SOUL_MD,
  "USER.md": DEFAULT_USER_MD,
  "MEMORY.md": DEFAULT_MEMORY_MD,
  "memory/preferences.md": DEFAULT_PREFERENCES_MD,
  "memory/growth-plan.md": DEFAULT_GROWTH_PLAN_MD,
  "memory/patterns.md": DEFAULT_PATTERNS_MD,
  "memory/key-decisions.md": DEFAULT_KEY_DECISIONS_MD,
};
