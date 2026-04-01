/**
 * Generic retry helpers for transient network and validation failures.
 */
import { z } from "zod";

/**
 * Promise-based delay utility.
 *
 * @param ms - Milliseconds to wait before resolving.
 * @returns Promise that resolves after the requested delay.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Determines whether an operation should be retried.
 *
 * Validation failures and unsupported input errors are treated as terminal
 * because retrying them will not change the outcome.
 *
 * @param error - The error raised by the previous attempt.
 * @returns `true` when a retry should be attempted.
 */
export function shouldRetry(error: unknown): boolean {
  if (error instanceof z.ZodError) {
    return false;
  }

  if (error instanceof Error && error.message.toLowerCase().includes("unsupported")) {
    return false;
  }

  return true;
}

/**
 * Calculates exponential backoff delay.
 *
 * Pattern: 1s, 2s, 4s for attempts 1, 2, 3.
 *
 * @param attempt - Current attempt number (1-indexed).
 * @returns Delay in milliseconds for the next retry.
 */
export function calculateBackoff(attempt: number): number {
  return 1000 * Math.pow(2, attempt - 1);
}
