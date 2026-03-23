/**
 * Thin Apify client for synchronous actor runs used by listing search tools.
 * @module lib/runner/tools/market/apify-client
 */
import { getApifyToken } from "@/lib/apify/env";

import { fetchWithTimeout, isAbortError } from "../web/fetch-with-timeout";

const APIFY_BASE_URL = "https://api.apify.com/v2";
const DEFAULT_TIMEOUT_MS = 90_000;

interface RunActorSyncOptions {
  timeoutMs?: number;
  maxTotalChargeUsd?: number;
}

/**
 * Runs an Apify actor synchronously and returns the dataset items.
 */
export async function runActorSync<T>(
  actorId: string,
  input: Record<string, unknown>,
  options?: RunActorSyncOptions,
): Promise<T[]> {
  const token = getApifyToken();
  if (!token) {
    throw new Error("APIFY_TOKEN is not configured");
  }

  const query = new URLSearchParams();
  if (typeof options?.maxTotalChargeUsd === "number") {
    query.set("maxTotalChargeUsd", String(options.maxTotalChargeUsd));
  }

  const encodedActorId = encodeURIComponent(actorId);
  const url =
    `${APIFY_BASE_URL}/acts/${encodedActorId}/run-sync-get-dataset-items` +
    `${query.size > 0 ? `?${query}` : ""}`;

  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      },
      options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const message =
        typeof body?.error?.message === "string"
          ? body.error.message
          : `HTTP ${response.status}`;

      throw new Error(`Apify actor ${actorId}: ${message}`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error(`Apify actor ${actorId}: Expected dataset items array`);
    }

    return payload as T[];
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error("Scraping timed out — try fewer results or a narrower search");
    }

    throw error;
  }
}
