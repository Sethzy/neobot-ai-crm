import { afterEach, describe, expect, it, vi } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";

import { calculateDriveTimeTool } from "../drive-time";

afterEach(() => {
  delete process.env.GOOGLE_MAPS_API_KEY;
  vi.unstubAllGlobals();
});

function makeContext(): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: {} as any,
    clientId: "client-1",
    isChatContext: true,
  };
}

function geocodeOk(formatted: string, partialMatch = false) {
  return {
    ok: true,
    json: async () => ({
      status: "OK",
      results: [{ formatted_address: formatted, partial_match: partialMatch }],
    }),
  };
}

function routeOk() {
  return {
    ok: true,
    json: async () => ({
      routes: [{
        duration: "5400s",
        distanceMeters: 12345,
        localizedValues: { duration: { text: "1 hr 30 mins" }, distance: { text: "12.3 km" } },
      }],
    }),
  };
}

describe("calculateDriveTimeTool", () => {
  it("returns formatted route data when both geocodes resolve cleanly", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(geocodeOk("Place A, Singapore"))
      .mockResolvedValueOnce(geocodeOk("Place B, Singapore"))
      .mockResolvedValueOnce(routeOk());
    vi.stubGlobal("fetch", fetchMock);

    const result = await calculateDriveTimeTool.execute(
      { origin: "A", destination: "B" },
      makeContext(),
    );

    expect(result).toEqual({
      success: true,
      origin: "A",
      destination: "B",
      resolved_origin: "Place A, Singapore",
      resolved_destination: "Place B, Singapore",
      duration_minutes: 90,
      duration_display: "1 hr 30 mins",
      distance_km: 12.3,
      distance_display: "12.3 km",
      traffic_aware: true,
    });
  });

  it("rejects when origin is a partial match (EC28 fix)", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(geocodeOk("Some real road, Singapore", true))
      .mockResolvedValueOnce(geocodeOk("Changi Airport Terminal 3"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await calculateDriveTimeTool.execute(
      { origin: "Definitely Not A Real Place 20260426", destination: "Changi T3" },
      makeContext(),
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("partially"),
    });
    // Routes API must NOT be called once geocoding flagged a partial match.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects when origin is unknown to the geocoder", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "ZERO_RESULTS" }),
      })
      .mockResolvedValueOnce(geocodeOk("Changi Airport Terminal 3"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await calculateDriveTimeTool.execute(
      { origin: "qwertyuiop99999", destination: "Changi T3" },
      makeContext(),
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("Could not resolve origin"),
    });
  });
});
