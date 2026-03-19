/**
 * Shared Browser-Use Cloud client singleton.
 * @module lib/browser-use/client
 */
import { BrowserUse } from "browser-use-sdk";

let browserUseClient: BrowserUse | null = null;
let browserUseApiKey: string | null = null;

/**
 * Returns the shared Browser-Use client for the current API key.
 * Throws when Browser-Use Cloud is not configured for this environment.
 */
export function getBrowserUseClient(): BrowserUse {
  const apiKey = process.env.BROWSER_USE_API_KEY;
  if (!apiKey) {
    throw new Error("BROWSER_USE_API_KEY is not configured.");
  }

  if (browserUseClient && browserUseApiKey === apiKey) {
    return browserUseClient;
  }

  browserUseClient = new BrowserUse({ apiKey });
  browserUseApiKey = apiKey;

  return browserUseClient;
}

/**
 * Returns whether Browser-Use Cloud is configured for the current runtime.
 */
export function isBrowserUseConfigured(): boolean {
  return Boolean(process.env.BROWSER_USE_API_KEY);
}
