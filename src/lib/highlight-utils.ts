/**
 * @file Highlight utilities for PDF bounding boxes
 * @description Converts ExtendAI polygon coordinates to react-pdf-viewer highlight areas
 */
import type { Point, Citation } from "@/types/extraction";

/**
 * Offsets citation page numbers from child PDF coordinates to original PDF coordinates.
 * Child PDF page 1 becomes original page startPage.
 *
 * @param citations - Citations from ExtendAI (page numbers relative to child PDF)
 * @param startPage - Start page of split in original PDF (1-indexed)
 * @returns New citation array with offset page numbers
 *
 * @example
 * // Split covers pages 3-5 of original PDF
 * // Child PDF page 1 = original page 3
 * const offsetCitations = offsetCitationPages(citations, 3);
 */
export function offsetCitationPages(
  citations: Citation[],
  startPage: number
): Citation[] {
  return citations.map((citation) => ({
    ...citation,
    page: citation.page != null ? citation.page + startPage - 1 : undefined,
  }));
}

/**
 * Highlight area for react-pdf-viewer highlight plugin.
 * All values are percentages (0-100).
 */
export interface HighlightArea {
  /** Height as percentage of page */
  height: number;
  /** Width as percentage of page */
  width: number;
  /** Top offset as percentage of page */
  top: number;
  /** Left offset as percentage of page */
  left: number;
  /** Page index (0-indexed) */
  pageIndex: number;
}

/**
 * Converts a polygon from ExtendAI to a highlight area.
 *
 * @param params - Polygon points and page dimensions
 * @returns HighlightArea with percentage-based coordinates
 */
export function convertPolygonToHighlightArea({
  polygon,
  pageIndex,
  pageWidth,
  pageHeight,
}: {
  polygon: Point[];
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
}): HighlightArea {
  // Find bounding box from polygon points
  const boundingBox = polygon.reduce(
    (acc, curr) => ({
      left: Math.min(acc.left, curr.x),
      top: Math.min(acc.top, curr.y),
      right: Math.max(acc.right, curr.x),
      bottom: Math.max(acc.bottom, curr.y),
    }),
    { left: Infinity, top: Infinity, right: 0, bottom: 0 }
  );

  // Convert to percentages
  return {
    height: ((boundingBox.bottom - boundingBox.top) / pageHeight) * 100,
    width: ((boundingBox.right - boundingBox.left) / pageWidth) * 100,
    top: (boundingBox.top / pageHeight) * 100,
    left: (boundingBox.left / pageWidth) * 100,
    pageIndex,
  };
}

/**
 * Converts an array of citations to highlight areas.
 * Skips citations without polygon or page number.
 *
 * @param citations - Array of citations from ExtendAI
 * @param pageWidth - Page width in pixels (for percentage calculation)
 * @param pageHeight - Page height in pixels (for percentage calculation)
 * @returns Array of HighlightArea objects
 */
export function citationsToHighlightAreas(
  citations: Citation[],
  pageWidth: number,
  pageHeight: number
): HighlightArea[] {
  return citations
    .filter(
      (c): c is Citation & { page: number; polygon: Point[] } =>
        c.page != null && c.polygon != null && c.polygon.length >= 3
    )
    .map((c) =>
      convertPolygonToHighlightArea({
        polygon: c.polygon,
        // ExtendAI page is 1-indexed, react-pdf-viewer pageIndex is 0-indexed
        pageIndex: c.page - 1,
        pageWidth,
        pageHeight,
      })
    );
}
