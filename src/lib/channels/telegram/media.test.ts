/**
 * Tests for Telegram media helper functions.
 * @module lib/channels/telegram/media.test
 */
import { describe, expect, it } from "vitest";

import { getMediaFallbacks, resolveFileId } from "./media";

describe("resolveFileId", () => {
  it("picks the largest photo file id", () => {
    const result = resolveFileId("photo", {
      photo: [
        { file_id: "small", file_unique_id: "small-1", width: 100, height: 100 },
        { file_id: "large", file_unique_id: "large-1", width: 800, height: 800 },
      ],
    });

    expect(result).toBe("large");
  });

  it("extracts voice file ids", () => {
    expect(resolveFileId("voice", { voice: { file_id: "voice-123", duration: 5 } })).toBe(
      "voice-123",
    );
  });

  it("extracts document file ids", () => {
    expect(
      resolveFileId("document", {
        document: { file_id: "doc-123", file_name: "test.pdf" },
      }),
    ).toBe("doc-123");
  });

  it("returns null when the requested media type is absent", () => {
    expect(resolveFileId("photo", {})).toBeNull();
  });
});

describe("getMediaFallbacks", () => {
  it("returns jpg/jpeg for photos", () => {
    expect(getMediaFallbacks("photo")).toEqual({ ext: "jpg", mime: "image/jpeg" });
  });

  it("returns ogg/audio-ogg for voice notes", () => {
    expect(getMediaFallbacks("voice")).toEqual({ ext: "ogg", mime: "audio/ogg" });
  });

  it("returns binary defaults for unknown media types", () => {
    expect(getMediaFallbacks("unknown")).toEqual({
      ext: "bin",
      mime: "application/octet-stream",
    });
  });
});
