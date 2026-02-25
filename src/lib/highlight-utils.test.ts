/**
 * @file Highlight utilities tests
 * @description Tests for converting ExtendAI polygon coordinates to react-pdf-viewer highlight areas
 */
import { describe, expect, it } from "vitest";
import {
  convertPolygonToHighlightArea,
  citationsToHighlightAreas,
} from "./highlight-utils";
import type { Point, Citation } from "@/types/extraction";

describe("convertPolygonToHighlightArea", () => {
  it("converts polygon coordinates to percentage-based highlight area", () => {
    const polygon: Point[] = [
      { x: 100, y: 200 },
      { x: 300, y: 200 },
      { x: 300, y: 250 },
      { x: 100, y: 250 },
    ];

    const result = convertPolygonToHighlightArea({
      polygon,
      pageIndex: 0,
      pageWidth: 600,
      pageHeight: 800,
    });

    // Left: 100/600 * 100 = 16.67
    expect(result.left).toBeCloseTo(16.67, 1);
    // Top: 200/800 * 100 = 25
    expect(result.top).toBeCloseTo(25, 1);
    // Width: (300-100)/600 * 100 = 33.33
    expect(result.width).toBeCloseTo(33.33, 1);
    // Height: (250-200)/800 * 100 = 6.25
    expect(result.height).toBeCloseTo(6.25, 1);
    expect(result.pageIndex).toBe(0);
  });
});

describe("citationsToHighlightAreas", () => {
  it("converts multiple citations to highlight areas", () => {
    const citations: Citation[] = [
      {
        page: 1,
        referenceText: "Test 1",
        polygon: [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 200, y: 150 },
          { x: 100, y: 150 },
        ],
      },
      {
        page: 2,
        referenceText: "Test 2",
        polygon: [
          { x: 50, y: 50 },
          { x: 150, y: 50 },
          { x: 150, y: 100 },
          { x: 50, y: 100 },
        ],
      },
    ];

    const result = citationsToHighlightAreas(citations, 600, 800);

    expect(result).toHaveLength(2);
    // First citation: page 1 -> pageIndex 0
    expect(result[0].pageIndex).toBe(0);
    // Second citation: page 2 -> pageIndex 1
    expect(result[1].pageIndex).toBe(1);
  });

  it("skips citations without polygon", () => {
    const citations: Citation[] = [
      { page: 1, referenceText: "Test" },
      {
        page: 2,
        polygon: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
      },
    ];

    const result = citationsToHighlightAreas(citations, 600, 800);

    expect(result).toHaveLength(1);
    expect(result[0].pageIndex).toBe(1);
  });

  it("skips citations without page number", () => {
    const citations: Citation[] = [
      {
        referenceText: "No page",
        polygon: [
          { x: 0, y: 0 },
          { x: 100, y: 100 },
        ],
      },
    ];

    const result = citationsToHighlightAreas(citations, 600, 800);

    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty citations", () => {
    const result = citationsToHighlightAreas([], 600, 800);
    expect(result).toHaveLength(0);
  });
});
