/**
 * Clipboard utilities for file extraction.
 * @module lib/clipboard-utils
 */

/**
 * Extracts File objects from a clipboard paste event.
 * Handles both file pastes and screenshot/image pastes.
 *
 * @param event - The clipboard paste event
 * @returns Array of File objects from clipboard (empty if no files)
 */
export function extractFilesFromClipboard(event: ClipboardEvent): File[] {
  const items = event.clipboardData?.items;
  if (!items) return [];

  const files: File[] = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].kind === "file") {
      const file = items[i].getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}
