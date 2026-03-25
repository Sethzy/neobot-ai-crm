/**
 * Tests for sandbox workflow skills (outer) and companion/primary skills.
 * @module lib/runner/skills/__tests__/sandbox-skills
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SKILL_CONTENT,
  DEFAULT_SKILL_SLUGS,
  INNER_SKILL_REFERENCES,
} from "../skill-templates";

describe("sandbox workflow skills", () => {
  // Outer workflow skills exist and reference execute_in_sandbox
  it.each(["deal-comparison", "property-showcase", "market-report"])(
    "%s skill exists and references execute_in_sandbox",
    (slug) => {
      expect(DEFAULT_SKILL_SLUGS).toContain(slug);
      const content = DEFAULT_SKILL_CONTENT[slug as keyof typeof DEFAULT_SKILL_CONTENT];
      expect(content).toBeDefined();
      expect(content).toContain("execute_in_sandbox");
      expect(content).not.toContain("analyze_spreadsheet");
      expect(content).not.toContain("publish_artifact");
    },
  );

  it("deal-comparison passes excel_editing and re-analyst skills", () => {
    const content = DEFAULT_SKILL_CONTENT["deal-comparison" as keyof typeof DEFAULT_SKILL_CONTENT];
    expect(content).toContain("excel_editing");
    expect(content).toContain("re-analyst");
    expect(content).toContain("search_crm");
  });

  it("property-showcase passes publish_website and frontend-design skills", () => {
    const content = DEFAULT_SKILL_CONTENT["property-showcase" as keyof typeof DEFAULT_SKILL_CONTENT];
    expect(content).toContain("publish_website");
    expect(content).toContain("frontend-design");
    expect(content).toContain("search_crm");
  });

  it("market-report passes excel_editing and re-analyst skills", () => {
    const content = DEFAULT_SKILL_CONTENT["market-report" as keyof typeof DEFAULT_SKILL_CONTENT];
    expect(content).toContain("excel_editing");
    expect(content).toContain("re-analyst");
  });

  // Primary sandbox skills have execute_in_sandbox in their descriptions
  it.each(["pdf_creation", "excel_editing", "docx_editing", "pptx_editing", "pdf_form_filling", "pdf_signing", "publish_website"])(
    "%s primary sandbox skill has execute_in_sandbox in description",
    (slug) => {
      const content = DEFAULT_SKILL_CONTENT[slug as keyof typeof DEFAULT_SKILL_CONTENT];
      expect(content).toBeDefined();
      expect(content).toContain("execute_in_sandbox");
    },
  );

  // Companion skills do NOT have execute_in_sandbox in their descriptions
  it.each(["re-analyst", "frontend-design"])(
    "%s companion skill does NOT have execute_in_sandbox in description",
    (slug) => {
      const content = DEFAULT_SKILL_CONTENT[slug as keyof typeof DEFAULT_SKILL_CONTENT];
      expect(content).toBeDefined();
      // Check the description line only (before the closing ---)
      const descriptionMatch = content.match(/description:\s*"([^"]+)"/);
      expect(descriptionMatch).toBeTruthy();
      expect(descriptionMatch![1]).not.toContain("execute_in_sandbox");
    },
  );

  it("re-analyst has reference files", () => {
    const refs = INNER_SKILL_REFERENCES["re-analyst"];
    expect(refs).toBeDefined();
    expect(refs["references/sg-property-taxes.md"]).toContain("ABSD");
    expect(refs["references/yield-benchmarks.md"]).toContain("REIT");
  });

  // All skill content has valid YAML frontmatter
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
