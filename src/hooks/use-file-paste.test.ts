/**
 * Tests for file paste hook.
 * @module hooks/use-file-paste.test
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useFilePaste } from "./use-file-paste";

/** Creates a mock paste event */
function createPasteEvent(
  files: File[],
  target: EventTarget = document.body
): ClipboardEvent {
  const items = files.map((file) => ({
    kind: "file" as const,
    type: file.type,
    getAsFile: () => file,
  })) as unknown as DataTransferItem[];

  const itemList = Object.assign(items, {
    length: items.length,
    [Symbol.iterator]: () => items[Symbol.iterator](),
  }) as unknown as DataTransferItemList;

  const event = new Event("paste", { bubbles: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: { items: itemList },
  });
  Object.defineProperty(event, "target", { value: target });
  return event;
}

describe("useFilePaste", () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  test("calls onFilesSelected when files pasted", () => {
    const onFilesSelected = vi.fn();
    renderHook(() => useFilePaste({ onFilesSelected }));

    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    const event = createPasteEvent([file]);
    window.dispatchEvent(event);

    expect(onFilesSelected).toHaveBeenCalledWith([file]);
  });

  test("ignores paste in input element", () => {
    const onFilesSelected = vi.fn();
    renderHook(() => useFilePaste({ onFilesSelected }));

    const input = document.createElement("input");
    document.body.appendChild(input);

    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    const event = createPasteEvent([file], input);
    window.dispatchEvent(event);

    expect(onFilesSelected).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  test("ignores paste in textarea element", () => {
    const onFilesSelected = vi.fn();
    renderHook(() => useFilePaste({ onFilesSelected }));

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);

    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    const event = createPasteEvent([file], textarea);
    window.dispatchEvent(event);

    expect(onFilesSelected).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });

  test("ignores paste in contenteditable element", () => {
    const onFilesSelected = vi.fn();
    renderHook(() => useFilePaste({ onFilesSelected }));

    const div = document.createElement("div");
    div.contentEditable = "true";
    document.body.appendChild(div);

    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    const event = createPasteEvent([file], div);
    window.dispatchEvent(event);

    expect(onFilesSelected).not.toHaveBeenCalled();
    document.body.removeChild(div);
  });

  test("does not call callback when no files in clipboard", () => {
    const onFilesSelected = vi.fn();
    renderHook(() => useFilePaste({ onFilesSelected }));

    const event = createPasteEvent([]);
    window.dispatchEvent(event);

    expect(onFilesSelected).not.toHaveBeenCalled();
  });

  test("extracts only files from mixed clipboard", () => {
    const onFilesSelected = vi.fn();
    renderHook(() => useFilePaste({ onFilesSelected }));

    const file = new File(["content"], "test.pdf", { type: "application/pdf" });

    // Create event with mixed items (file + text)
    const items = [
      { kind: "string" as const, type: "text/plain", getAsFile: () => null },
      { kind: "file" as const, type: "application/pdf", getAsFile: () => file },
    ] as unknown as DataTransferItem[];

    const itemList = Object.assign(items, {
      length: items.length,
      [Symbol.iterator]: () => items[Symbol.iterator](),
    }) as unknown as DataTransferItemList;

    const event = new Event("paste", { bubbles: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: { items: itemList },
    });
    Object.defineProperty(event, "target", { value: document.body });

    window.dispatchEvent(event);

    expect(onFilesSelected).toHaveBeenCalledWith([file]);
  });

  test("respects enabled=false flag", () => {
    const onFilesSelected = vi.fn();
    renderHook(() => useFilePaste({ onFilesSelected, enabled: false }));

    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    const event = createPasteEvent([file]);
    window.dispatchEvent(event);

    expect(onFilesSelected).not.toHaveBeenCalled();
  });

  test("cleans up listener on unmount", () => {
    const onFilesSelected = vi.fn();
    const { unmount } = renderHook(() => useFilePaste({ onFilesSelected }));

    unmount();

    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    const event = createPasteEvent([file]);
    window.dispatchEvent(event);

    expect(onFilesSelected).not.toHaveBeenCalled();
  });
});
