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

describe("calculateDriveTimeTool", () => {
  it("returns formatted route data", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [{
          duration: "5400s",
          distanceMeters: 12345,
          localizedValues: { duration: { text: "1 hr 30 mins" }, distance: { text: "12.3 km" } },
        }],
      }),
    }));

    const result = await calculateDriveTimeTool.execute(
      { origin: "A", destination: "B" },
      makeContext(),
    );

    expect(result).toEqual({
      success: true,
      origin: "A",
      destination: "B",
      duration_minutes: 90,
      duration_display: "1 hr 30 mins",
      distance_km: 12.3,
      distance_display: "12.3 km",
      traffic_aware: true,
    });
  });
});
