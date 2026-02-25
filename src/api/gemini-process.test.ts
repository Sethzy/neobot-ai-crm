/**
 * @file Tests for Gemini processing API endpoint helpers
 * @description Tests request validation, token extraction, and response helpers
 */
import { describe, expect, it } from "vitest";
import {
  validateRequest,
  extractToken,
  createSuccessResponse,
  createErrorResponse,
} from "./gemini-process";
import type { GeminiSplitterResponseType } from "@/types/gemini";

describe("validateRequest", () => {
  it("accepts valid documentId", () => {
    const body = { documentId: "123e4567-e89b-12d3-a456-426614174000" };
    const result = validateRequest(body);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.documentId).toBe(
        "123e4567-e89b-12d3-a456-426614174000"
      );
    }
  });

  it("rejects missing documentId", () => {
    const body = {};
    const result = validateRequest(body);
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID format", () => {
    const body = { documentId: "not-a-uuid" };
    const result = validateRequest(body);
    expect(result.success).toBe(false);
  });
});

describe("extractToken", () => {
  it("extracts Bearer token from Authorization header", () => {
    const token = extractToken("Bearer abc123xyz");
    expect(token).toBe("abc123xyz");
  });

  it("returns null for missing header", () => {
    const token = extractToken(undefined);
    expect(token).toBeNull();
  });

  it("returns null for non-Bearer auth", () => {
    const token = extractToken("Basic abc123");
    expect(token).toBeNull();
  });

  it("returns null for malformed Bearer header", () => {
    const token = extractToken("Bearer");
    expect(token).toBeNull();
  });
});

describe("createSuccessResponse", () => {
  it("wraps data in success response", () => {
    const data: GeminiSplitterResponseType = {
      schema_version: "splitter_v2",
      summary: "Test document bundle",
      suggested_filename: "test-bundle",
      splits: [
        {
          observation: "Invoice on page 1",
          startPage: 1,
          endPage: 1,
          type: "invoices",
          identifier: null,
          document_date: null,
          potential_duplicate: null,
        },
      ],
    };

    const response = createSuccessResponse(data);

    expect(response.success).toBe(true);
    expect(response.data.summary).toBe("Test document bundle");
    expect(response.data.splits).toHaveLength(1);
  });
});

describe("createErrorResponse", () => {
  it("wraps error message in error response", () => {
    const response = createErrorResponse("Something went wrong");

    expect(response.success).toBe(false);
    expect(response.error).toBe("Something went wrong");
  });
});
