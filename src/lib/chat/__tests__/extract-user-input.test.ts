/**
 * Tests for `extractUserInput` — parses text and file parts from an AI SDK
 * message's `parts` array.
 *
 * @module lib/chat/__tests__/extract-user-input.test
 */
import { describe, it, expect } from "vitest";

import { extractUserInput } from "../extract-user-input";

describe("extractUserInput", () => {
  it("extracts text from text parts", () => {
    const result = extractUserInput({
      parts: [
        { type: "text", text: "hello" },
        { type: "text", text: "world" },
      ],
    });
    expect(result.text).toBe("hello\nworld");
    expect(result.fileParts).toEqual([]);
  });

  it("extracts file parts", () => {
    const result = extractUserInput({
      parts: [
        {
          type: "file",
          url: "https://example.com/doc.pdf",
          mediaType: "application/pdf",
          filename: "doc.pdf",
        },
      ],
    });
    expect(result.text).toBeNull();
    expect(result.fileParts).toHaveLength(1);
    expect(result.fileParts[0]).toMatchObject({
      type: "file",
      url: "https://example.com/doc.pdf",
      mediaType: "application/pdf",
      filename: "doc.pdf",
    });
  });

  it("handles mixed text and file parts", () => {
    const result = extractUserInput({
      parts: [
        { type: "text", text: "check this" },
        {
          type: "file",
          url: "https://example.com/img.png",
          mediaType: "image/png",
        },
      ],
    });
    expect(result.text).toBe("check this");
    expect(result.fileParts).toHaveLength(1);
  });

  it("returns null text when all text parts are empty", () => {
    const result = extractUserInput({
      parts: [{ type: "text", text: "  " }],
    });
    expect(result.text).toBeNull();
  });

  it("ignores unknown part types", () => {
    const result = extractUserInput({
      parts: [{ type: "unknown", foo: "bar" }, { type: "text", text: "hi" }],
    });
    expect(result.text).toBe("hi");
    expect(result.fileParts).toEqual([]);
  });

  it("handles empty parts array", () => {
    const result = extractUserInput({ parts: [] });
    expect(result.text).toBeNull();
    expect(result.fileParts).toEqual([]);
  });
});
