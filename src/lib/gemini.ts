/**
 * @file Gemini API helper functions
 * @description Provides utilities for calling Gemini API with structured output,
 * including retry logic with exponential backoff.
 */
import { z } from "zod";

/**
 * Promise-based delay utility.
 * @param ms - Milliseconds to wait
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Maps error types to user-friendly messages.
 *
 * @param error - The error thrown during processing
 * @returns Human-readable error message for display
 */
export function getProcessingErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return "Processing returned unexpected data.";
  }

  if (error instanceof SyntaxError) {
    return "Could not analyze file format.";
  }

  if (error instanceof Error) {
    if (error.name === "TimeoutError") {
      return "Processing timed out. Please try re-uploading.";
    }

    if (error.message.includes("429")) {
      return "Service busy. Please try re-uploading.";
    }
  }

  return "Processing failed. Please try re-uploading.";
}

/**
 * Determines if an error is retryable.
 * Validation and unsupported file errors should not be retried.
 *
 * @param error - The error to check
 * @returns true if the operation should be retried
 */
export function shouldRetry(error: unknown): boolean {
  // Don't retry validation errors
  if (error instanceof z.ZodError) {
    return false;
  }

  if (error instanceof Error) {
    // Don't retry unsupported file types
    if (error.message.toLowerCase().includes("unsupported")) {
      return false;
    }
  }

  // Retry everything else (network, timeout, rate limit, etc.)
  return true;
}

/**
 * Calculates exponential backoff delay.
 * Pattern: 1s, 2s, 4s for attempts 1, 2, 3.
 *
 * @param attempt - Current attempt number (1-indexed)
 * @returns Delay in milliseconds
 */
export function calculateBackoff(attempt: number): number {
  return 1000 * Math.pow(2, attempt - 1);
}
