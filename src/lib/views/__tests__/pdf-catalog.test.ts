/**
 * Tests for the PDF document catalog.
 * @module lib/views/__tests__/pdf-catalog
 */
import { describe, expect, it } from "vitest";

import { pdfCatalog } from "../pdf-catalog";

describe("pdfCatalog", () => {
  it("generates a non-empty system prompt", () => {
    const prompt = pdfCatalog.prompt();
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(100);
  });

  it("system prompt includes Document and Page component references", () => {
    const prompt = pdfCatalog.prompt();
    expect(prompt).toContain("Document");
    expect(prompt).toContain("Page");
    expect(prompt).toContain("Table");
  });

  it("system prompt includes Text and Heading components", () => {
    const prompt = pdfCatalog.prompt();
    expect(prompt).toContain("Text");
    expect(prompt).toContain("Heading");
  });
});
