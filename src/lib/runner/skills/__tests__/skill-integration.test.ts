/**
 * Integration tests for bundled instruction skill defaults.
 * Tests the inlined constants in skill-templates.ts — the single source of truth.
 * @module lib/runner/skills/__tests__/skill-integration
 */
import { describe, expect, it } from "vitest";

import { parseFrontmatter } from "../discover-skills";
import { DEFAULT_SKILL_CONTENT, DEFAULT_SKILL_SLUGS } from "../skill-templates";

describe("bundled instruction skills", () => {
  it("ships eight defaults with valid frontmatter", () => {
    expect(DEFAULT_SKILL_SLUGS).toHaveLength(8);

    for (const slug of DEFAULT_SKILL_SLUGS) {
      const content = DEFAULT_SKILL_CONTENT[slug];
      const metadata = parseFrontmatter(content);

      expect(metadata, `${slug} should have valid frontmatter`).not.toBeNull();
      expect(metadata?.name, `${slug} frontmatter name should match slug`).toBe(slug);
      expect(metadata?.description.length, `${slug} description should not be empty`).toBeGreaterThan(10);
    }
  });

  it("references only universally available tools", () => {
    const forbiddenReferences = ["send_message", "browse_website", "conn_"];

    for (const slug of DEFAULT_SKILL_SLUGS) {
      const content = DEFAULT_SKILL_CONTENT[slug];

      for (const ref of forbiddenReferences) {
        expect(
          content.includes(ref),
          `${slug} must not reference "${ref}"`,
        ).toBe(false);
      }
    }
  });
});
