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
