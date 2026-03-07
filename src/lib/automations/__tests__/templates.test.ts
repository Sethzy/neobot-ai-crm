/**
 * Tests for the automation template catalog.
 * @module lib/automations/__tests__/templates
 */
import { describe, expect, it } from "vitest";

import { AUTOMATION_TEMPLATES, type AutomationTemplate } from "../templates";

describe("AUTOMATION_TEMPLATES", () => {
  it("exports a non-empty array of templates", () => {
    expect(Array.isArray(AUTOMATION_TEMPLATES)).toBe(true);
    expect(AUTOMATION_TEMPLATES.length).toBeGreaterThanOrEqual(6);
  });

  it("every template has required fields with non-empty strings", () => {
    for (const t of AUTOMATION_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.title).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.category).toBeTruthy();
      expect(t.prompt).toBeTruthy();
      expect(t.prompt.length).toBeGreaterThan(20);
    }
  });

  it("all template IDs are unique", () => {
    const ids = AUTOMATION_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every category is one of the allowed values", () => {
    const allowedCategories = ["sales", "operations", "research", "marketing"];
    for (const t of AUTOMATION_TEMPLATES) {
      expect(allowedCategories).toContain(t.category);
    }
  });
});
