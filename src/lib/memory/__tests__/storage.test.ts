/**
 * Tests for shared memory storage helpers.
 * @module lib/memory/__tests__/storage
 */
import { describe, expect, it } from "vitest";

import {
  decodeStorageTextPayload,
  getStoragePath,
  isMissingStorageObjectError,
  isStorageConflictError,
} from "../storage";

describe("decodeStorageTextPayload", () => {
  it("returns plain strings as-is", async () => {
    await expect(decodeStorageTextPayload("plain text", "SOUL.md")).resolves.toBe(
      "plain text",
    );
  });

  it("reads Blob-like payloads via text()", async () => {
    // jsdom Blob lacks .text(), so use a duck-typed object matching Supabase's response.
    const blob = { text: async () => "# markdown" };
    await expect(decodeStorageTextPayload(blob, "USER.md")).resolves.toBe("# markdown");
  });

  it("reads payloads that implement text() (non-Blob)", async () => {
    await expect(
      decodeStorageTextPayload(
        { text: async () => "# markdown" },
        "USER.md",
      ),
    ).resolves.toBe("# markdown");
  });

  it("throws for unsupported payloads", async () => {
    await expect(decodeStorageTextPayload({ bad: true }, "SOUL.md")).rejects.toThrow(
      "unsupported payload",
    );
  });
});

describe("getStoragePath", () => {
  it("joins clientId and path", () => {
    expect(getStoragePath("client-1", "SOUL.md")).toBe("client-1/SOUL.md");
    expect(getStoragePath("c", "memory/preferences.md")).toBe("c/memory/preferences.md");
  });
});

describe("isMissingStorageObjectError", () => {
  it("detects 404 status", () => {
    expect(isMissingStorageObjectError({ status: 404 })).toBe(true);
  });

  it("detects statusCode strings", () => {
    expect(isMissingStorageObjectError({ statusCode: "NoSuchKey" })).toBe(true);
    expect(isMissingStorageObjectError({ statusCode: "ObjectNotFound" })).toBe(true);
    expect(isMissingStorageObjectError({ statusCode: "NotFound" })).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isMissingStorageObjectError({ status: 403 })).toBe(false);
    expect(isMissingStorageObjectError("string")).toBe(false);
  });
});

describe("isStorageConflictError", () => {
  it("detects 409 status", () => {
    expect(isStorageConflictError({ status: 409 })).toBe(true);
  });

  it("detects statusCode strings", () => {
    expect(isStorageConflictError({ statusCode: "ResourceAlreadyExists" })).toBe(true);
    expect(isStorageConflictError({ statusCode: "AlreadyExists" })).toBe(true);
  });

  it("detects message-based already exists", () => {
    expect(isStorageConflictError({ message: "The resource already exists" })).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isStorageConflictError({ status: 500 })).toBe(false);
  });
});
