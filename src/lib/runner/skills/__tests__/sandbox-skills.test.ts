/**
 * Tests for sandbox workflow skills (outer) and inner coding skills.
 * @module lib/runner/skills/__tests__/sandbox-skills
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SKILL_CONTENT,
  DEFAULT_SKILL_SLUGS,
  INNER_SKILL_REFERENCES,
} from "../skill-templates";

describe("sandbox workflow skills", () => {
  // Outer skills exist and reference the right tools
  it.each(["deal-comparison", "property-showcase", "market-report"])(
    "%s skill exists in defaults",
    (slug) => {
      expect(DEFAULT_SKILL_SLUGS).toContain(slug);
      expect(DEFAULT_SKILL_CONTENT[slug as keyof typeof DEFAULT_SKILL_CONTENT]).toBeDefined();
    },
  );

  it("deal-comparison references analyze_spreadsheet", () => {
    const content = DEFAULT_SKILL_CONTENT["deal-comparison" as keyof typeof DEFAULT_SKILL_CONTENT];
    expect(content).toContain("analyze_spreadsheet");
    expect(content).toContain("search_crm");
  });

  it("property-showcase references publish_artifact", () => {
    const content = DEFAULT_SKILL_CONTENT["property-showcase" as keyof typeof DEFAULT_SKILL_CONTENT];
    expect(content).toContain("publish_artifact");
    expect(content).toContain("search_crm");
    expect(content).toContain("web_search");
  });

  it("market-report references analyze_spreadsheet", () => {
    const content = DEFAULT_SKILL_CONTENT["market-report" as keyof typeof DEFAULT_SKILL_CONTENT];
    expect(content).toContain("analyze_spreadsheet");
    expect(content).toContain("browser_scrape");
  });

  // Inner skills exist and are marked as editable
  it.each(["re-analyst", "frontend-design"])(
    "%s inner skill exists and is editable",
    (slug) => {
      const content = DEFAULT_SKILL_CONTENT[slug as keyof typeof DEFAULT_SKILL_CONTENT];
      expect(content).toBeDefined();
      expect(content).toContain("editable: true");
    },
  );

  it("re-analyst has reference files", () => {
    const refs = INNER_SKILL_REFERENCES["re-analyst"];
    expect(refs).toBeDefined();
    expect(refs["references/sg-property-taxes.md"]).toContain("ABSD");
    expect(refs["references/yield-benchmarks.md"]).toContain("REIT");
  });

  // Skill content has valid YAML frontmatter
  it.each(DEFAULT_SKILL_SLUGS)("%s has valid frontmatter", (slug) => {
    const content = DEFAULT_SKILL_CONTENT[slug as keyof typeof DEFAULT_SKILL_CONTENT];
    expect(content).toMatch(/^---\n/);
    expect(content).toContain("name:");
    expect(content).toContain("description:");
  });

  // Outer skills warn not to do computation in chat
  it("deal-comparison warns against chat computation", () => {
    const content = DEFAULT_SKILL_CONTENT["deal-comparison" as keyof typeof DEFAULT_SKILL_CONTENT];
    expect(content).toContain("Do NOT calculate");
  });

  // Outer skills remind to gather BEFORE calling sandbox
  it("property-showcase reminds to gather first", () => {
    const content = DEFAULT_SKILL_CONTENT["property-showcase" as keyof typeof DEFAULT_SKILL_CONTENT];
    expect(content).toContain("Gather ALL data BEFORE");
  });
});
