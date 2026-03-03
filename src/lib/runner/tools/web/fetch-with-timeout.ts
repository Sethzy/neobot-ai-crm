/**
 * Shared fetch timeout helper for web utility tools.
 * @module lib/runner/tools/web/fetch-with-timeout
 */
const DEFAULT_TIMEOUT_MS = 15_000;

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

