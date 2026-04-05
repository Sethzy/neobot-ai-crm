/**
 * Maps CRM attachment filenames to display categories.
 * @module lib/crm/file-categories
 */

/** File categories supported by the Files tab in V1. */
export type FileCategory =
  | "pdf"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "image"
  | "other";

const EXTENSION_TO_CATEGORY: Record<string, FileCategory> = {
  pdf: "pdf",
  doc: "document",
  docx: "document",
  txt: "document",
  md: "document",
  html: "document",
  xml: "document",
  json: "document",
  xls: "spreadsheet",
  xlsx: "spreadsheet",
  csv: "spreadsheet",
  ppt: "presentation",
  pptx: "presentation",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
};

/**
 * Derives the Files tab display category from a filename extension.
 *
 * @param filename - Original user-visible filename.
 * @returns One of the supported Files tab categories.
 */
export function getFileCategory(filename: string): FileCategory {
  const extension = filename.split(".").pop()?.toLowerCase();

  if (!extension || !filename.includes(".")) {
    return "other";
  }

  return EXTENSION_TO_CATEGORY[extension] ?? "other";
}
