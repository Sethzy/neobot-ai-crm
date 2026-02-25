/**
 * @file PDF splitting utility using pdf-lib
 * @description Splits PDFs into child PDFs containing specified page ranges.
 * Child PDFs are ephemeral (processed in memory, not stored).
 */
import { PDFDocument } from "pdf-lib";

/**
 * Page range for splitting (1-indexed, inclusive).
 */
export interface SplitRange {
  /** First page to include (1-indexed) */
  startPage: number;
  /** Last page to include (1-indexed) */
  endPage: number;
}

/**
 * Result from splitting a PDF.
 */
export interface SplitResult {
  /** Child PDF bytes */
  bytes: Uint8Array;
  /** Page width in points (from first page of range) */
  pageWidth: number;
  /** Page height in points (from first page of range) */
  pageHeight: number;
}

/**
 * Gets the total page count of a PDF.
 *
 * @param pdfBytes - PDF file as Uint8Array
 * @returns Total number of pages
 */
export async function getPdfPageCount(pdfBytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(pdfBytes);
  return doc.getPageCount();
}

/**
 * Gets page dimensions from a PDF without splitting.
 * Used when splitting is skipped (single doc = whole PDF).
 *
 * @param pdfBytes - PDF file as Uint8Array
 * @param pageNumber - Page to get dimensions from (1-indexed, default: 1)
 * @returns Page width and height in points
 */
export async function getPdfDimensions(
  pdfBytes: Uint8Array,
  pageNumber = 1
): Promise<{ pageWidth: number; pageHeight: number }> {
  const doc = await PDFDocument.load(pdfBytes);
  const page = doc.getPage(pageNumber - 1);
  const { width: pageWidth, height: pageHeight } = page.getSize();
  return { pageWidth, pageHeight };
}

/**
 * Splits a PDF into a child PDF containing only the specified pages.
 * Returns the child PDF bytes along with page dimensions.
 *
 * @param pdfBytes - Source PDF file as Uint8Array
 * @param range - Page range to extract (1-indexed, inclusive)
 * @returns Child PDF bytes and dimensions
 * @throws Error if page range is invalid
 *
 * @example
 * // Extract pages 2-4 from a 10-page PDF
 * const { bytes, pageWidth, pageHeight } = await splitPdf(originalPdfBytes, { startPage: 2, endPage: 4 });
 */
export async function splitPdf(
  pdfBytes: Uint8Array,
  range: SplitRange
): Promise<SplitResult> {
  // Validate range
  if (range.startPage < 1) {
    throw new Error("startPage must be >= 1");
  }
  if (range.endPage < range.startPage) {
    throw new Error("Invalid page range: endPage must be >= startPage");
  }

  const srcDoc = await PDFDocument.load(pdfBytes);
  const totalPages = srcDoc.getPageCount();

  if (range.endPage > totalPages) {
    throw new Error(
      `Page range exceeds document: requested page ${range.endPage}, document has ${totalPages} pages`
    );
  }

  // Get dimensions from first page of this split's range
  const firstPage = srcDoc.getPage(range.startPage - 1);
  const { width: pageWidth, height: pageHeight } = firstPage.getSize();

  const newDoc = await PDFDocument.create();

  // pdf-lib uses 0-indexed pages, convert from 1-indexed
  const pageIndices = Array.from(
    { length: range.endPage - range.startPage + 1 },
    (_, i) => range.startPage - 1 + i
  );

  const pages = await newDoc.copyPages(srcDoc, pageIndices);
  pages.forEach((page) => newDoc.addPage(page));

  return {
    bytes: await newDoc.save(),
    pageWidth,
    pageHeight,
  };
}

/**
 * Determines if PDF splitting can be skipped.
 * Returns true if there's exactly one split spanning the entire document.
 *
 * @param splits - Array of split ranges from Gemini
 * @param totalPages - Total pages in the PDF
 * @returns True if splitting can be skipped
 */
export function shouldSkipSplit(
  splits: SplitRange[],
  totalPages: number
): boolean {
  if (splits.length !== 1) return false;
  const split = splits[0];
  return split.startPage === 1 && split.endPage === totalPages;
}
