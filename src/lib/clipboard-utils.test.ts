/**
 * Tests for clipboard utilities.
 * @module lib/clipboard-utils.test
 */
import { describe, test, expect } from "vitest";
import { extractFilesFromClipboard } from "./clipboard-utils";

/** Creates a mock ClipboardEvent with the given items */
function createClipboardEvent(
  items: Array<{ kind: string; type: string; file?: File }>
): ClipboardEvent {
  const dataTransferItems = items.map((item) => ({
    kind: item.kind,
    type: item.type,
    getAsFile: () => item.file ?? null,
  })) as unknown as DataTransferItem[];

  // Add length and iterator to make it array-like
  const itemList = Object.assign(dataTransferItems, {
    length: dataTransferItems.length,
    [Symbol.iterator]: () => dataTransferItems[Symbol.iterator](),
  }) as unknown as DataTransferItemList;

  return {
    clipboardData: {
      items: itemList,
    },
  } as unknown as ClipboardEvent;
}

describe("extractFilesFromClipboard", () => {
  test("extracts files from DataTransferItemList", () => {
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    const event = createClipboardEvent([
      { kind: "file", type: "application/pdf", file },
    ]);

    const result = extractFilesFromClipboard(event);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(file);
  });

  test("filters out non-file items (text, html)", () => {
    const file = new File(["content"], "doc.pdf", { type: "application/pdf" });
    const event = createClipboardEvent([
      { kind: "string", type: "text/plain" },
      { kind: "file", type: "application/pdf", file },
      { kind: "string", type: "text/html" },
    ]);

    const result = extractFilesFromClipboard(event);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(file);
  });

  test("returns empty array when no files", () => {
    const event = createClipboardEvent([
      { kind: "string", type: "text/plain" },
      { kind: "string", type: "text/html" },
    ]);

    const result = extractFilesFromClipboard(event);

    expect(result).toEqual([]);
  });

  test("returns empty array when clipboardData is null", () => {
    const event = { clipboardData: null } as unknown as ClipboardEvent;

    const result = extractFilesFromClipboard(event);

    expect(result).toEqual([]);
  });

  test("handles screenshot pastes (image blob)", () => {
    const imageBlob = new File(["fake-png-data"], "image.png", {
      type: "image/png",
    });
    const event = createClipboardEvent([
      { kind: "file", type: "image/png", file: imageBlob },
    ]);

    const result = extractFilesFromClipboard(event);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("image/png");
  });

  test("extracts multiple files from clipboard", () => {
    const file1 = new File(["a"], "a.pdf", { type: "application/pdf" });
    const file2 = new File(["b"], "b.jpg", { type: "image/jpeg" });
    const event = createClipboardEvent([
      { kind: "file", type: "application/pdf", file: file1 },
      { kind: "file", type: "image/jpeg", file: file2 },
    ]);

    const result = extractFilesFromClipboard(event);

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(file1);
    expect(result[1]).toBe(file2);
  });
});
