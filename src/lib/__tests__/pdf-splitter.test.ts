/**
 * @file Tests for PDF splitting utility
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { PDFDocument } from "pdf-lib";
import { splitPdf, getPdfPageCount, shouldSkipSplit } from "../pdf-splitter";

describe("splitPdf", () => {
  const testPdfBytes = new Uint8Array(
    readFileSync("tests/fixtures/5-page-test.pdf")
  );

  it("extracts pages 2-3 from a 5-page PDF", async () => {
    const result = await splitPdf(testPdfBytes, {
      startPage: 2,
      endPage: 3,
    });

    // Load child PDF and verify page count
    const childDoc = await PDFDocument.load(result.bytes);
    expect(childDoc.getPageCount()).toBe(2);
  });

  it("extracts single page (page 4)", async () => {
    const result = await splitPdf(testPdfBytes, {
      startPage: 4,
      endPage: 4,
    });

    const childDoc = await PDFDocument.load(result.bytes);
    expect(childDoc.getPageCount()).toBe(1);
  });

  it("extracts all pages when range spans entire document", async () => {
    const result = await splitPdf(testPdfBytes, {
      startPage: 1,
      endPage: 5,
    });

    const childDoc = await PDFDocument.load(result.bytes);
    expect(childDoc.getPageCount()).toBe(5);
  });
});

describe("getPdfPageCount", () => {
  const testPdfBytes = new Uint8Array(
    readFileSync("tests/fixtures/5-page-test.pdf")
  );

  it("returns correct page count for test PDF", async () => {
    const count = await getPdfPageCount(testPdfBytes);
    expect(count).toBe(5);
  });
});

describe("splitPdf edge cases", () => {
  const testPdfBytes = new Uint8Array(
    readFileSync("tests/fixtures/5-page-test.pdf")
  );

  it("throws for invalid page range (start > end)", async () => {
    await expect(
      splitPdf(testPdfBytes, { startPage: 4, endPage: 2 })
    ).rejects.toThrow("Invalid page range");
  });

  it("throws for page number exceeding document", async () => {
    await expect(
      splitPdf(testPdfBytes, { startPage: 1, endPage: 10 })
    ).rejects.toThrow("exceeds document");
  });

  it("throws for page number below 1", async () => {
    await expect(
      splitPdf(testPdfBytes, { startPage: 0, endPage: 3 })
    ).rejects.toThrow("must be >= 1");
  });
});

describe("splitPdf returns dimensions", () => {
  const testPdfBytes = new Uint8Array(
    readFileSync("tests/fixtures/5-page-test.pdf")
  );

  it("returns pageWidth and pageHeight from first page of range", async () => {
    const result = await splitPdf(testPdfBytes, { startPage: 1, endPage: 2 });

    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.pageWidth).toBe(612); // Test PDF is US Letter
    expect(result.pageHeight).toBe(792);
  });

  it("returns dimensions from split's first page, not document's first page", async () => {
    // If pages had different sizes, this would test that we get the right one
    const result = await splitPdf(testPdfBytes, { startPage: 3, endPage: 5 });

    expect(result.pageWidth).toBe(612);
    expect(result.pageHeight).toBe(792);
  });
});

describe("shouldSkipSplit", () => {
  it("returns true for single split spanning entire document", () => {
    const splits = [{ startPage: 1, endPage: 5 }];
    expect(shouldSkipSplit(splits, 5)).toBe(true);
  });

  it("returns false for single split not starting at page 1", () => {
    const splits = [{ startPage: 2, endPage: 5 }];
    expect(shouldSkipSplit(splits, 5)).toBe(false);
  });

  it("returns false for single split not ending at last page", () => {
    const splits = [{ startPage: 1, endPage: 4 }];
    expect(shouldSkipSplit(splits, 5)).toBe(false);
  });

  it("returns false for multiple splits", () => {
    const splits = [
      { startPage: 1, endPage: 2 },
      { startPage: 3, endPage: 5 },
    ];
    expect(shouldSkipSplit(splits, 5)).toBe(false);
  });

  it("returns false for empty splits array", () => {
    expect(shouldSkipSplit([], 5)).toBe(false);
  });
});
