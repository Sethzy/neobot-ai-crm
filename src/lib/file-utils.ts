/**
 * File validation and processing utilities.
 * @module lib/file-utils
 */

/**
 * Allowed file MIME types for upload.
 */
export const ALLOWED_FILE_TYPES = {
  "application/pdf": "pdf",
  "image/jpeg": "jpeg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "text/plain": "txt",
} as const;

/**
 * Allowed file extensions (for fallback check).
 */
export const ALLOWED_EXTENSIONS = ["pdf", "jpeg", "jpg", "png", "webp", "txt"];

/**
 * Maximum file size in bytes (50MB).
 */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Validates that a file has an allowed type.
 * Checks MIME type first, then falls back to extension.
 * @param file - The file to validate
 * @returns true if file type is allowed
 */
export function validateFileType(file: File): boolean {
  // Check MIME type
  if (file.type in ALLOWED_FILE_TYPES) {
    return true;
  }

  // Fallback: check extension
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext ? ALLOWED_EXTENSIONS.includes(ext) : false;
}

/**
 * Validates that a file is under the size limit.
 * @param file - The file to validate
 * @returns true if file size is allowed
 */
export function validateFileSize(file: File): boolean {
  return file.size <= MAX_FILE_SIZE;
}

/**
 * Computes SHA-256 hash of a file.
 * Uses FileReader.readAsArrayBuffer for binary-safe hashing.
 * @param file - The file to hash
 * @returns Hex-encoded hash string
 */
export async function computeFileHash(file: File): Promise<string> {
  // Read file as ArrayBuffer via FileReader (binary-safe, jsdom compatible)
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });

  // Wrap in Uint8Array for cross-environment compatibility (jsdom quirk)
  const data = new Uint8Array(buffer);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Extracts file extension from filename.
 * @param filename - The filename
 * @returns Lowercase extension without dot, or empty string
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  if (parts.length < 2) return "";
  return parts.pop()?.toLowerCase() ?? "";
}
