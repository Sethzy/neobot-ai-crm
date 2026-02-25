/**
 * @fileoverview Validation utilities for template file uploads.
 * Enforces file type, size, and count constraints per design spec.
 */

/** Allowed template file extensions */
export const TEMPLATE_ALLOWED_EXTENSIONS = [
  '.xlsx',
  '.xls',
  '.pptx',
  '.docx',
  '.pdf',
  '.csv',
  '.json',
  '.xml',
  '.txt',
  '.md',
] as const;

/** Maximum number of template files per session */
export const TEMPLATE_MAX_FILES = 3;

/** Maximum size per file in bytes (50MB) */
export const TEMPLATE_MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Maximum total size of all files in bytes (100MB) */
export const TEMPLATE_MAX_TOTAL_SIZE = 100 * 1024 * 1024;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface BatchValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a single template file against type and size constraints.
 * @param file - The File object to validate
 * @returns Validation result with error message if invalid
 */
export function validateTemplateFile(file: File): ValidationResult {
  const extension = getFileExtension(file.name);

  if (
    !TEMPLATE_ALLOWED_EXTENSIONS.includes(
      extension as (typeof TEMPLATE_ALLOWED_EXTENSIONS)[number]
    )
  ) {
    return {
      valid: false,
      error: `Unsupported file type for "${file.name}": ${extension}. Allowed: ${TEMPLATE_ALLOWED_EXTENSIONS.join(', ')}`,
    };
  }

  if (file.size > TEMPLATE_MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File "${file.name}" exceeds 50MB limit (${formatBytes(file.size)})`,
    };
  }

  return { valid: true };
}

/**
 * Validates a batch of template files against all constraints.
 * Checks file count, total size, and individual file validity.
 * @param files - Array of File objects to validate
 * @returns Batch validation result with all error messages
 */
export function validateTemplateFiles(files: File[]): BatchValidationResult {
  const errors: string[] = [];

  if (files.length > TEMPLATE_MAX_FILES) {
    errors.push(`Maximum ${TEMPLATE_MAX_FILES} files allowed, got ${files.length}`);
  }

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > TEMPLATE_MAX_TOTAL_SIZE) {
    errors.push(`Total size ${formatBytes(totalSize)} exceeds 100MB limit`);
  }

  for (const file of files) {
    const result = validateTemplateFile(file);
    if (!result.valid && result.error) {
      errors.push(result.error);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Extracts the file extension from a filename (including the dot).
 * @param filename - The filename to extract extension from
 * @returns Extension with leading dot (e.g., ".xlsx") or empty string
 */
function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : '';
}

/**
 * Formats bytes into human-readable string.
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
