/**
 * Utilities for bulk document downloads.
 * @module lib/download-utils
 */
import JSZip from "jszip";
import type { Document } from "@/types/documents";

/** Size thresholds in bytes */
const WARN_THRESHOLD = 100 * 1024 * 1024; // 100MB
const BLOCK_THRESHOLD = 200 * 1024 * 1024; // 200MB

/**
 * Calculate total size of documents in bytes.
 *
 * @param documents - Array of documents to sum
 * @returns Total size in bytes
 */
export function calculateTotalSize(documents: Document[]): number {
  return documents.reduce((sum, doc) => sum + (doc.file_size || 0), 0);
}

/**
 * Format bytes as human-readable string.
 *
 * @param bytes - Size in bytes
 * @returns Formatted string like "1.5 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Get download status based on total size.
 *
 * @param totalBytes - Total download size in bytes
 * @returns "ok" | "warn" | "block"
 */
export function getDownloadSizeStatus(
  totalBytes: number
): "ok" | "warn" | "block" {
  if (totalBytes >= BLOCK_THRESHOLD) return "block";
  if (totalBytes >= WARN_THRESHOLD) return "warn";
  return "ok";
}

/**
 * Download multiple documents as a zip file.
 *
 * @param documents - Documents to include in the zip
 * @param caseName - Name for the zip file (without extension)
 * @param getSignedUrl - Function to get signed URL for a document
 */
export async function downloadDocumentsAsZip(
  documents: Document[],
  caseName: string,
  getSignedUrl: (doc: Document) => Promise<string>
): Promise<void> {
  const zip = new JSZip();

  // Fetch all files and add to zip
  await Promise.all(
    documents.map(async (doc) => {
      const url = await getSignedUrl(doc);
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Failed to fetch ${doc.original_filename}`);
        return;
      }
      const data = await response.arrayBuffer();
      const filename = doc.renamed_filename || doc.original_filename;
      zip.file(filename, data);
    })
  );

  // Generate and download zip
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${caseName}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
