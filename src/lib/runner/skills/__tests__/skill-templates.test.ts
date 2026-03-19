/**
 * Tests that bundled skill content is available as string constants,
 * not dependent on filesystem reads at runtime.
 * @module lib/runner/skills/__tests__/skill-templates
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SKILL_CONTENT,
  DEFAULT_SKILL_SLUGS,
  SYSTEM_SKILL_CONTENT,
  getDefaultSkillContent,
  isDefaultSkillSlug,
} from "../skill-templates";

describe("DEFAULT_SKILL_CONTENT", () => {
  it("contains all 7 default skill slugs", () => {
    expect(DEFAULT_SKILL_SLUGS).toHaveLength(7);
    for (const slug of DEFAULT_SKILL_SLUGS) {
      expect(DEFAULT_SKILL_CONTENT[slug], `missing content for ${slug}`).toBeDefined();
      expect(DEFAULT_SKILL_CONTENT[slug].length).toBeGreaterThan(50);
    }
  });

  it("each default skill has valid YAML frontmatter with name matching slug", () => {
    for (const slug of DEFAULT_SKILL_SLUGS) {
      const content = DEFAULT_SKILL_CONTENT[slug];
      expect(content, `${slug} should start with ---`).toMatch(/^---\r?\n/);
      expect(content, `${slug} should contain name: ${slug}`).toContain(`name: ${slug}`);
      expect(content, `${slug} should contain description:`).toContain("description:");
    }
  });

  it("default skills reference only universally-available tools", () => {
    const forbiddenTools = ["send_message", "browse_website", "conn_"];
    for (const slug of DEFAULT_SKILL_SLUGS) {
      const content = DEFAULT_SKILL_CONTENT[slug];
      for (const tool of forbiddenTools) {
        expect(
          content.includes(tool),
          `${slug} must not reference optional tool "${tool}"`,
        ).toBe(false);
      }
    }
  });
});

describe("SYSTEM_SKILL_CONTENT", () => {
  it("contains the creating-connections SKILL.md", () => {
    const content = SYSTEM_SKILL_CONTENT["creating-connections/SKILL.md"];
    expect(content).toBeDefined();
    expect(content).toContain("# Creating New Connections");
    expect(content).toContain("create_new_connections");
  });

  it("contains the direct API connection guide", () => {
    const content = SYSTEM_SKILL_CONTENT["creating-connections/create-direct-api-connection.md"];
    expect(content).toBeDefined();
    expect(content).toContain("Direct API");
    expect(content).toContain("authConfig");
  });

  it("returns undefined for unknown paths", () => {
    expect(SYSTEM_SKILL_CONTENT["nonexistent/SKILL.md" as keyof typeof SYSTEM_SKILL_CONTENT]).toBeUndefined();
  });
});

describe("isDefaultSkillSlug", () => {
  it("returns true for bundled defaults", () => {
    expect(isDefaultSkillSlug("call-prep")).toBe(true);
    expect(isDefaultSkillSlug("daily-briefing")).toBe(true);
    expect(isDefaultSkillSlug("market-briefing")).toBe(true);
  });

  it("returns false for custom skills", () => {
    expect(isDefaultSkillSlug("deal-closed")).toBe(false);
    expect(isDefaultSkillSlug("my-custom")).toBe(false);
  });
});

describe("getDefaultSkillContent", () => {
  it("returns content for a bundled default", () => {
    const content = getDefaultSkillContent("call-prep");
    expect(content).not.toBeNull();
    expect(content).toContain("name: call-prep");
  });

  it("returns null for a non-default slug", () => {
    expect(getDefaultSkillContent("deal-closed")).toBeNull();
  });
});
