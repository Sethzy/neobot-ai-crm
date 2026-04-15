/**
 * Default predefined skills that every client gets on first use.
 *
 * Existing workflow skills stay active by default to preserve current agent
 * behavior. Core document-processing skills are also active by default so
 * every client always has the base office-document toolchain installed.
 *
 * @module lib/runner/skills/default-installed-skills
 */

export const DEFAULT_INSTALLED_SKILL_SLUGS = [
  "call-prep",
  "call-summary",
  "daily-briefing",
  "deal-comparison",
  "draft-outreach",
  "market-briefing",
  "market-report",
  "onboarding",
  "opportunity-analysis",
  "pipeline-review",
  "property-showcase",
  "docx",
  "pdf",
  "pptx",
  "xlsx",
] as const;

export const DEFAULT_INSTALLED_SKILL_SLUG_SET = new Set<string>(
  DEFAULT_INSTALLED_SKILL_SLUGS,
);
