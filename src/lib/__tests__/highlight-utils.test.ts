/**
 * @file Tests for highlight utilities
 */
import { describe, it, expect } from "vitest";
import { offsetCitationPages } from "../highlight-utils";
import type { Citation } from "@/types/extraction";

describe("offsetCitationPages", () => {
  it("offsets citation page numbers by startPage - 1", () => {
    const citations: Citation[] = [
      { page: 1, polygon: [{ x: 0, y: 0 }] },
      { page: 2, polygon: [{ x: 10, y: 10 }] },
    ];

    // Split starts at page 3 in original PDF
    const result = offsetCitationPages(citations, 3);

    expect(result[0].page).toBe(3); // 1 + (3-1) = 3
    expect(result[1].page).toBe(4); // 2 + (3-1) = 4
  });

  it("preserves polygon coordinates unchanged", () => {
    const citations: Citation[] = [
      { page: 1, polygon: [{ x: 100, y: 200 }, { x: 300, y: 400 }] },
    ];

    const result = offsetCitationPages(citations, 5);

    expect(result[0].polygon).toEqual([{ x: 100, y: 200 }, { x: 300, y: 400 }]);
  });

  it("preserves referenceText unchanged", () => {
    const citations: Citation[] = [
      { page: 1, referenceText: "test text", polygon: [] },
    ];

    const result = offsetCitationPages(citations, 2);

    expect(result[0].referenceText).toBe("test text");
  });

  it("skips citations without page number", () => {
    const citations: Citation[] = [
      { polygon: [{ x: 0, y: 0 }] }, // no page
      { page: 1, polygon: [{ x: 10, y: 10 }] },
    ];

    const result = offsetCitationPages(citations, 3);

    expect(result[0].page).toBeUndefined();
    expect(result[1].page).toBe(3);
  });

  it("returns new array (immutable)", () => {
    const citations: Citation[] = [{ page: 1, polygon: [] }];

    const result = offsetCitationPages(citations, 5);

    expect(result).not.toBe(citations);
    expect(citations[0].page).toBe(1); // original unchanged
  });
});
