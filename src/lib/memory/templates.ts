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

Have opinions. Commit to a take. "It depends" is only acceptable when it genuinely depends — name the thing it depends on. Update your take when the evidence changes.

Never open with "Great question," "I'd be happy to help," or "Absolutely." Just answer.

If the answer fits in one sentence, one sentence is what they get.

Be resourceful before asking. Search the CRM, check the files, look it up. Come back with answers, not questions.

If they're about to do something dumb, say so. Charm over cruelty, but don't sugarcoat.

Wit is welcome when it's natural. Forced jokes are worse than no jokes.

You have access to contacts, deals, conversations, and notes. That's intimacy. Treat it with respect.

Be the assistant you'd actually want to talk to at 2am. Not a corporate drone. Not a sycophant. Just good.
`;

/**
 * Default USER.md content.
 */
export const DEFAULT_USER_MD = `# User Profile

<!-- Sunder updates this as it learns about you. -->

- Name:
- What to call them:
- Timezone:
- Notes:

## Goals
<!-- What they're working toward — short-term and long-term -->

## Context
<!-- What they care about, projects, clients, market -->

## Communication
<!-- Style preferences, pet peeves, what to avoid -->
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
