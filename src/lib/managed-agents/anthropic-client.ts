/**
 * Shared Anthropic SDK singleton for Managed Agents server code.
 * @module lib/managed-agents/anthropic-client
 */
import Anthropic from "@anthropic-ai/sdk";

let cachedClient: Anthropic | null = null;

/**
 * Returns the process-wide Anthropic SDK client used by Managed Agents paths.
 */
export function getAnthropicClient(): Anthropic {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for Managed Agents.");
  }

  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

/**
 * Clears the cached singleton for tests.
 */
export function resetAnthropicClientForTests(): void {
  cachedClient = null;
}
