/**
 * Tests for Google Maps drive-time tool behavior.
 * @module lib/runner/tools/web/__tests__/drive-time
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDriveTimeTool } from "../drive-time";

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("createDriveTimeTool", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-google-maps-key");
  });

  it("returns formatted drive-time results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        routes: [
          {
            duration: "1380s",
            distanceMeters: 14234,
            localizedValues: {
              duration: { text: "23 min" },
              distance: { text: "14.2 km" },
            },
          },
        ],
      }),
    });

    const tools = createDriveTimeTool();
    const result = await tools.calculate_drive_time.execute(
      {
        origin: "Marina Bay Sands, Singapore",
        destination: "Changi Airport, Singapore",
        departure_time: "2026-03-10T09:00:00+08:00",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      origin: "Marina Bay Sands, Singapore",
      destination: "Changi Airport, Singapore",
      duration_minutes: 23,
      duration_display: "23 min",
      distance_km: 14.2,
      distance_display: "14.2 km",
      traffic_aware: true,
    });
  });

  it("defaults departure_time to now and sends the expected Google request", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T01:23:45.000Z"));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        routes: [
          {
            duration: "900s",
            distanceMeters: 5000,
          },
        ],
      }),
    });

    const tools = createDriveTimeTool();
    await tools.calculate_drive_time.execute(
      {
        origin: "1 Raffles Place, Singapore",
        destination: "9 Battery Road, Singapore",
      },
      EXECUTION_OPTIONS,
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [fetchUrl, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(fetchUrl).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
    expect(options.method).toBe("POST");
    expect((options.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    expect((options.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe(
      "test-google-maps-key",
    );
    expect((options.headers as Record<string, string>)["X-Goog-FieldMask"]).toBe(
      "routes.duration,routes.distanceMeters,routes.localizedValues",
    );

    const body = JSON.parse(options.body as string) as {
      origin: { address: string };
      destination: { address: string };
      travelMode: string;
      routingPreference: string;
      departureTime: string;
    };

    expect(body).toEqual({
      origin: { address: "1 Raffles Place, Singapore" },
      destination: { address: "9 Battery Road, Singapore" },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE_OPTIMAL",
      departureTime: "2026-03-10T01:23:45.000Z",
    });
  });

  it("returns fallback display values when localizedValues are missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        routes: [
          {
            duration: "3660s",
            distanceMeters: 12345,
          },
        ],
      }),
    });

    const tools = createDriveTimeTool();
    const result = await tools.calculate_drive_time.execute(
      {
        origin: "Office",
        destination: "Client meeting",
        departure_time: "2026-03-10T09:00:00+08:00",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      origin: "Office",
      destination: "Client meeting",
      duration_minutes: 61,
      duration_display: "1 hr 1 min",
      distance_km: 12.3,
      distance_display: "12.3 km",
      traffic_aware: true,
    });
  });

  it("returns an error when GOOGLE_MAPS_API_KEY is missing", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");

    const tools = createDriveTimeTool();
    const result = await tools.calculate_drive_time.execute(
      {
        origin: "Origin",
        destination: "Destination",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "GOOGLE_MAPS_API_KEY is not configured.",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns API errors from Google Maps Routes", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    });

    const tools = createDriveTimeTool();
    const result = await tools.calculate_drive_time.execute(
      {
        origin: "Origin",
        destination: "Destination",
        departure_time: "2026-03-10T09:00:00+08:00",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "Google Maps Routes API error: 403 Forbidden",
    });
  });

  it("returns a no-route error when the API returns no routes", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ routes: [] }),
    });

    const tools = createDriveTimeTool();
    const result = await tools.calculate_drive_time.execute(
      {
        origin: "Origin",
        destination: "Destination",
        departure_time: "2026-03-10T09:00:00+08:00",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "No driving route found between the provided locations.",
    });
  });

  it("returns timeout error when Google request aborts and passes AbortSignal", async () => {
    const abortError = Object.assign(new Error("The operation was aborted."), {
      name: "AbortError",
    });
    mockFetch.mockRejectedValueOnce(abortError);

    const tools = createDriveTimeTool();
    const result = await tools.calculate_drive_time.execute(
      {
        origin: "Origin",
        destination: "Destination",
        departure_time: "2026-03-10T09:00:00+08:00",
      },
      EXECUTION_OPTIONS,
    );

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBeDefined();
    expect(result).toEqual({
      success: false,
      error: "Google Maps Routes request timed out.",
    });
  });

  it("rejects multi-stop input and past departure times at the schema level", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T01:23:45.000Z"));
    const { calculate_drive_time } = createDriveTimeTool();

    expect(
      calculate_drive_time.inputSchema.safeParse({
        origin: "Office",
        destination: "Stop 1|Stop 2",
      }).success,
    ).toBe(false);

    expect(
      calculate_drive_time.inputSchema.safeParse({
        origin: "Office",
        destination: "Client meeting",
        departure_time: "2026-03-09T09:00:00+08:00",
      }).success,
    ).toBe(false);
  });
});
