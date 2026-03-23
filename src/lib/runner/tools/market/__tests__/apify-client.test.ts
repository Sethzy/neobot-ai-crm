/**
 * Tests for the shared Apify actor client.
 * @module lib/runner/tools/market/__tests__/apify-client
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFetchWithTimeout, mockIsAbortError } = vi.hoisted(() => ({
  mockFetchWithTimeout: vi.fn(),
  mockIsAbortError: vi.fn(),
}));

vi.mock("../../web/fetch-with-timeout", () => ({
  fetchWithTimeout: mockFetchWithTimeout,
  isAbortError: mockIsAbortError,
}));

import { runActorSync } from "../apify-client";

describe("runActorSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APIFY_TOKEN", "apify-token");
    mockIsAbortError.mockReturnValue(false);
  });

  it("calls Apify with bearer auth and returns dataset items", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: "listing-1" }]), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const results = await runActorSync("actor/name", { query: "marina bay" });

    expect(results).toEqual([{ id: "listing-1" }]);
    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      "https://api.apify.com/v2/acts/actor%2Fname/run-sync-get-dataset-items",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer apify-token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ query: "marina bay" }),
      }),
      90_000,
    );
  });

  it("passes maxTotalChargeUsd as a query parameter when configured", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await runActorSync("actor/name", {}, { maxTotalChargeUsd: 0.25 });

    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      "https://api.apify.com/v2/acts/actor%2Fname/run-sync-get-dataset-items?maxTotalChargeUsd=0.25",
      expect.any(Object),
      90_000,
    );
  });

  it("parses Apify error payloads instead of returning a generic HTTP error", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: "Actor run did not succeed",
          },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(runActorSync("actor/name", {})).rejects.toThrow(
      "Apify actor actor/name: Actor run did not succeed",
    );
  });

  it("translates aborts into a user-facing timeout error", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    mockFetchWithTimeout.mockRejectedValueOnce(abortError);
    mockIsAbortError.mockReturnValueOnce(true);

    await expect(runActorSync("actor/name", {})).rejects.toThrow(
      "Scraping timed out — try fewer results or a narrower search",
    );
  });

  it("throws when APIFY_TOKEN is missing", async () => {
    vi.stubEnv("APIFY_TOKEN", "");

    await expect(runActorSync("actor/name", {})).rejects.toThrow(
      "APIFY_TOKEN is not configured",
    );
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });
});
