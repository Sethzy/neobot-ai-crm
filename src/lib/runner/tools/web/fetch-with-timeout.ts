/**
 * Shared fetch helpers for web utility tools.
 * @module lib/runner/tools/web/fetch-with-timeout
 */
const DEFAULT_TIMEOUT_MS = 15_000;

/** Checks whether an error is an AbortController timeout abort. */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Executes fetch with an AbortController timeout.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

