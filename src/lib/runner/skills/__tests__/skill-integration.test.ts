/**
 * Integration tests for bundled instruction skill defaults.
 * Tests the inlined constants in skill-templates.ts — the single source of truth.
 * @module lib/runner/skills/__tests__/skill-integration
 */
import { describe, expect, it } from "vitest";

import { parseFrontmatter } from "../discover-skills";
import { DEFAULT_SKILL_CONTENT, DEFAULT_SKILL_SLUGS } from "../skill-templates";

describe("bundled instruction skills", () => {
  it("ships twenty defaults with valid frontmatter", () => {
    expect(DEFAULT_SKILL_SLUGS).toHaveLength(20);

    for (const slug of DEFAULT_SKILL_SLUGS) {
      const content = DEFAULT_SKILL_CONTENT[slug];
      const metadata = parseFrontmatter(content);

      expect(metadata, `${slug} should have valid frontmatter`).not.toBeNull();
      expect(metadata?.name, `${slug} frontmatter name should match slug`).toBe(slug);
      expect(metadata?.description.length, `${slug} description should not be empty`).toBeGreaterThan(10);
    }
  });

  it("references only universally available tools", () => {
    // Connection-prefixed tools are never available in default skills
    const forbiddenReferences = ["conn_"];
    // Outer workflow skills are allowed to reference platform tools like send_message
    // and browser tools since those are available in the runner
    const outerWorkflowSlugs = new Set(["deal-comparison", "property-showcase", "market-report"]);

    for (const slug of DEFAULT_SKILL_SLUGS) {
      const content = DEFAULT_SKILL_CONTENT[slug];

      for (const ref of forbiddenReferences) {
        expect(
          content.includes(ref),
          `${slug} must not reference "${ref}"`,
        ).toBe(false);
      }

      // Non-workflow skills should not reference send_message or browse_website
      if (!outerWorkflowSlugs.has(slug)) {
        for (const ref of ["send_message", "browse_website"]) {
          expect(
            content.includes(ref),
            `${slug} must not reference "${ref}"`,
          ).toBe(false);
        }
      }
    }
  });
});
