/**
 * Tests for Supabase Storage error helpers.
 * @module lib/storage/__tests__/storage-errors
 */
import { describe, expect, it } from "vitest";

import {
  getStorageErrorMessage,
  isMissingStorageObjectError,
  isStorageConflictError,
} from "../storage-errors";

describe("isMissingStorageObjectError", () => {
  it("matches 404 status", () => {
    expect(isMissingStorageObjectError({ status: 404 })).toBe(true);
  });

  it("matches NoSuchKey status codes case-insensitively", () => {
    expect(isMissingStorageObjectError({ statusCode: "NoSuchKey" })).toBe(true);
    expect(isMissingStorageObjectError({ statusCode: "NOTFOUND" })).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isMissingStorageObjectError({ status: 500 })).toBe(false);
    expect(isMissingStorageObjectError(null)).toBe(false);
  });
});

describe("isStorageConflictError", () => {
  it("matches 409 status", () => {
    expect(isStorageConflictError({ status: 409 })).toBe(true);
  });

  it("matches 'already exists' message", () => {
    expect(isStorageConflictError({ message: "Object already exists" })).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isStorageConflictError({ status: 500, message: "boom" })).toBe(false);
  });
});

describe("getStorageErrorMessage", () => {
  it("unwraps Error instances", () => {
    expect(getStorageErrorMessage(new Error("kaboom"))).toBe("kaboom");
  });

  it("extracts .message from plain objects", () => {
    expect(getStorageErrorMessage({ message: "nope" })).toBe("nope");
  });

  it("falls back to String() for unknown shapes", () => {
    expect(getStorageErrorMessage(123)).toBe("123");
  });
});
