/**
 * Tests for shared memory storage helpers.
 * @module lib/memory/__tests__/storage
 */
import { describe, expect, it } from "vitest";

import { decodeStorageTextPayload } from "../storage";

describe("decodeStorageTextPayload", () => {
  it("returns plain strings as-is", async () => {
    await expect(decodeStorageTextPayload("plain text", "SOUL.md")).resolves.toBe(
      "plain text",
    );
  });

  it("reads payloads that implement text()", async () => {
    await expect(
      decodeStorageTextPayload(
        { text: async () => "# markdown" },
        "USER.md",
      ),
    ).resolves.toBe("# markdown");
  });

  it("reads payloads that implement arrayBuffer()", async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode("buffer text");

    await expect(
      decodeStorageTextPayload(
        {
          arrayBuffer: async () => bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
        },
        "MEMORY.md",
      ),
    ).resolves.toBe("buffer text");
  });

  it("throws for unsupported payloads", async () => {
    await expect(decodeStorageTextPayload({ bad: true }, "SOUL.md")).rejects.toThrow(
      "unsupported payload",
    );
  });
});
