/**
 * @fileoverview Utilities for image upload in analyst chat.
 * Handles validation, conversion, and constants for image attachments.
 */

/** Maximum file size in bytes (5MB) */
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

/** Maximum images per message */
export const MAX_IMAGES_PER_MESSAGE = 5;

/** Accepted MIME types for image uploads */
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/**
 * Validate that a file is an accepted image type and under size limit.
 * @param file - The file to validate
 * @returns Validation result with valid flag and optional error message
 */
export function validateImageFile(file: File): { valid: true } | { valid: false; error: string } {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return { valid: false, error: 'Only images are supported (PNG, JPG, WebP, GIF)' };
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return { valid: false, error: 'Image must be under 5MB' };
  }
  return { valid: true };
}

/**
 * Convert a File to a base64 string (without data URL prefix).
 * @param file - The file to convert
 * @returns Promise resolving to base64 encoded string
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Remove "data:image/png;base64," prefix
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
