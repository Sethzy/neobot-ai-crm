/**
 * Tests file extension → category mapping.
 * @module lib/crm/file-categories.test
 */
import { describe, expect, it } from "vitest";

import { getFileCategory } from "./file-categories";

describe("getFileCategory", () => {
  it("returns 'pdf' for .pdf files", () => {
    expect(getFileCategory("report.pdf")).toBe("pdf");
  });

  it("returns 'document' for .docx files", () => {
    expect(getFileCategory("proposal.docx")).toBe("document");
  });

  it("returns 'document' for .doc files", () => {
    expect(getFileCategory("old-file.doc")).toBe("document");
  });

  it("returns 'spreadsheet' for .xlsx files", () => {
    expect(getFileCategory("budget.xlsx")).toBe("spreadsheet");
  });

  it("returns 'spreadsheet' for .csv files", () => {
    expect(getFileCategory("data.csv")).toBe("spreadsheet");
  });

  it("returns 'presentation' for .pptx files", () => {
    expect(getFileCategory("deck.pptx")).toBe("presentation");
  });

  it("returns 'image' for .jpg files", () => {
    expect(getFileCategory("photo.jpg")).toBe("image");
  });

  it("returns 'image' for .png files", () => {
    expect(getFileCategory("screenshot.png")).toBe("image");
  });

  it("returns 'image' for .webp files", () => {
    expect(getFileCategory("hero.webp")).toBe("image");
  });

  it("returns 'other' for unknown extensions", () => {
    expect(getFileCategory("archive.zip")).toBe("other");
  });

  it("returns 'other' for files without extensions", () => {
    expect(getFileCategory("README")).toBe("other");
  });

  it("is case-insensitive", () => {
    expect(getFileCategory("REPORT.PDF")).toBe("pdf");
    expect(getFileCategory("image.JPG")).toBe("image");
  });
});
