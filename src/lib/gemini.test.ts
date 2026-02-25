/**
 * @file Tests for Gemini API helper functions
 * @description Tests retry logic, error handling, and prompt construction
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import {
  sleep,
  getProcessingErrorMessage,
  shouldRetry,
  calculateBackoff,
} from "./gemini";

describe("sleep", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves after specified milliseconds", async () => {
    const promise = sleep(1000);

    vi.advanceTimersByTime(999);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(1);
    await promise;

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("getProcessingErrorMessage", () => {
  it("returns validation error message for ZodError", () => {
    const zodError = new z.ZodError([
      {
        code: "invalid_type",
        expected: "string",
        path: ["field"],
        message: "Expected string",
      } as z.core.$ZodIssueInvalidType,
    ]);

    expect(getProcessingErrorMessage(zodError)).toBe(
      "Processing returned unexpected data."
    );
  });

  it("returns JSON error message for SyntaxError", () => {
    const syntaxError = new SyntaxError("Unexpected token");

    expect(getProcessingErrorMessage(syntaxError)).toBe(
      "Could not analyze file format."
    );
  });

  it("returns timeout message for timeout errors", () => {
    const timeoutError = new Error("Request timeout");
    timeoutError.name = "TimeoutError";

    expect(getProcessingErrorMessage(timeoutError)).toBe(
      "Processing timed out. Please try re-uploading."
    );
  });

  it("returns rate limit message for 429 errors", () => {
    const rateLimitError = new Error("429 Too Many Requests");

    expect(getProcessingErrorMessage(rateLimitError)).toBe(
      "Service busy. Please try re-uploading."
    );
  });

  it("returns generic message for unknown errors", () => {
    const unknownError = new Error("Something went wrong");

    expect(getProcessingErrorMessage(unknownError)).toBe(
      "Processing failed. Please try re-uploading."
    );
  });
});

describe("shouldRetry", () => {
  it("returns false for ZodError (validation failure)", () => {
    const zodError = new z.ZodError([]);
    expect(shouldRetry(zodError)).toBe(false);
  });

  it("returns false for unsupported file errors", () => {
    const unsupportedError = new Error("Unsupported file type");
    expect(shouldRetry(unsupportedError)).toBe(false);
  });

  it("returns true for network errors", () => {
    const networkError = new Error("Network request failed");
    expect(shouldRetry(networkError)).toBe(true);
  });

  it("returns true for rate limit errors", () => {
    const rateLimitError = new Error("429 Too Many Requests");
    expect(shouldRetry(rateLimitError)).toBe(true);
  });

  it("returns true for timeout errors", () => {
    const timeoutError = new Error("Request timeout");
    timeoutError.name = "TimeoutError";
    expect(shouldRetry(timeoutError)).toBe(true);
  });
});

describe("calculateBackoff", () => {
  it("returns 1000ms for attempt 1", () => {
    expect(calculateBackoff(1)).toBe(1000);
  });

  it("returns 2000ms for attempt 2", () => {
    expect(calculateBackoff(2)).toBe(2000);
  });

  it("returns 4000ms for attempt 3", () => {
    expect(calculateBackoff(3)).toBe(4000);
  });
});
