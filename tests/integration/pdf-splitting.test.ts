/**
 * @file Integration test for PDF splitting flow
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { splitPdf, getPdfPageCount, shouldSkipSplit } from "@/lib/pdf-splitter";
import { offsetCitationPages } from "@/lib/highlight-utils";
import type { Citation } from "@/types/extraction";

describe("PDF Splitting Integration", () => {
  const testPdfBytes = new Uint8Array(
    readFileSync("tests/fixtures/5-page-test.pdf")
  );

  it("full flow: split PDF, simulate extraction, offset citations", async () => {
    // Simulate Gemini returning 2 splits
    const splits = [
      { startPage: 1, endPage: 2, type: "invoice" },
      { startPage: 3, endPage: 5, type: "receipt" },
    ];

    const totalPages = await getPdfPageCount(testPdfBytes);
    expect(shouldSkipSplit(splits, totalPages)).toBe(false);

    // Create child PDFs
    const result1 = await splitPdf(testPdfBytes, { startPage: 1, endPage: 2 });
    const result2 = await splitPdf(testPdfBytes, { startPage: 3, endPage: 5 });

    expect(await getPdfPageCount(result1.bytes)).toBe(2);
    expect(await getPdfPageCount(result2.bytes)).toBe(3);

    // Verify dimensions are returned
    expect(result1.pageWidth).toBe(612);
    expect(result1.pageHeight).toBe(792);

    // Simulate ExtendAI returning citations relative to child PDF
    // Child PDF 2 page 1 = original page 3
    const rawCitations: Citation[] = [
      { page: 1, polygon: [{ x: 100, y: 100 }], referenceText: "test" },
      { page: 2, polygon: [{ x: 200, y: 200 }] },
    ];

    // Offset for split 2 (startPage: 3)
    const offsetCitations = offsetCitationPages(rawCitations, 3);

    expect(offsetCitations[0].page).toBe(3); // child page 1 → original page 3
    expect(offsetCitations[1].page).toBe(4); // child page 2 → original page 4
    expect(offsetCitations[0].polygon).toEqual([{ x: 100, y: 100 }]);
  });

  it("skip optimization: single split spanning entire PDF", async () => {
    const splits = [{ startPage: 1, endPage: 5, type: "full_doc" }];
    const totalPages = await getPdfPageCount(testPdfBytes);

    expect(shouldSkipSplit(splits, totalPages)).toBe(true);

    // No citation offset needed when startPage is 1
    const citations: Citation[] = [{ page: 3, polygon: [] }];
    const offset = offsetCitationPages(citations, 1);
    expect(offset[0].page).toBe(3); // 3 + (1-1) = 3, unchanged
  });
});
