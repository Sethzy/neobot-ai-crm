/**
 * Drive-time tool for managed agents.
 *
 * @module lib/managed-agents/tools/web/drive-time
 */
import { z } from "zod";

import { fetchWithTimeout, isAbortError } from "@/lib/runner/tools/web/fetch-with-timeout";

import type { ManagedAgentTool } from "../types";

const GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const GOOGLE_ROUTES_FIELD_MASK = "routes.duration,routes.distanceMeters,routes.localizedValues";

function doesNotContainWaypointSeparators(value: string): boolean {
  return !value.includes("|");
}

function isFutureDateTime(value: string): boolean {
  return new Date(value).getTime() >= Date.now();
}

function parseDurationToMinutes(duration?: string): number | null {
  if (!duration) {
    return null;
  }
  const match = /^([\d.]+)s$/.exec(duration);
  if (!match) {
    return null;
  }
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  return Math.ceil(seconds / 60);
}

function formatDurationDisplay(durationMinutes: number): string {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  if (hours === 0) return `${durationMinutes} ${durationMinutes === 1 ? "min" : "mins"}`;
  if (minutes === 0) return `${hours} ${hours === 1 ? "hr" : "hrs"}`;
  return `${hours} ${hours === 1 ? "hr" : "hrs"} ${minutes} ${minutes === 1 ? "min" : "mins"}`;
}

function formatDistanceKm(distanceKm: number): string {
  return `${distanceKm.toFixed(1)} km`;
}

const inputSchema = z.object({
  origin: z.string().trim().min(1).refine(doesNotContainWaypointSeparators, { message: "Multi-stop routes are not supported. Provide a single origin address." }).describe("The starting address or place name."),
  destination: z.string().trim().min(1).refine(doesNotContainWaypointSeparators, { message: "Multi-stop routes are not supported. Provide a single destination address." }).describe("The destination address or place name."),
  departure_time: z.string().datetime({ offset: true }).refine(isFutureDateTime, { message: "departure_time must be now or in the future." }).optional().describe("Optional ISO 8601 datetime with offset for traffic-aware routing."),
});

type DriveTimeInput = z.infer<typeof inputSchema>;

export const calculateDriveTimeTool: ManagedAgentTool<DriveTimeInput> = {
  name: "calculate_drive_time",
  description: "Calculate traffic-aware driving time between two addresses using Google Maps Routes API.",
  inputSchema,
  execute: async ({ origin, destination, departure_time }) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return { success: false as const, error: "GOOGLE_MAPS_API_KEY is not configured." };
    }

    try {
      const departureTime = departure_time ?? new Date().toISOString();
      const response = await fetchWithTimeout(GOOGLE_ROUTES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": GOOGLE_ROUTES_FIELD_MASK,
        },
        body: JSON.stringify({
          origin: { address: origin },
          destination: { address: destination },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE_OPTIMAL",
          departureTime,
        }),
      });

      if (!response.ok) {
        return { success: false as const, error: `Google Maps Routes API error: ${response.status} ${response.statusText}` };
      }

      const data = (await response.json()) as {
        routes?: Array<{
          duration?: string;
          distanceMeters?: number;
          localizedValues?: { duration?: { text?: string }; distance?: { text?: string } };
        }>;
      };
      const route = data.routes?.[0];
      if (!route) {
        return { success: false as const, error: "No driving route found between the provided locations." };
      }

      const durationMinutes = parseDurationToMinutes(route.duration);
      const distanceMeters = route.distanceMeters;
      if (durationMinutes === null || distanceMeters === undefined) {
        return { success: false as const, error: "Google Maps Routes response was missing duration or distance data." };
      }

      const distanceKm = Number((distanceMeters / 1000).toFixed(1));
      return {
        success: true as const,
        origin,
        destination,
        duration_minutes: durationMinutes,
        duration_display: route.localizedValues?.duration?.text ?? formatDurationDisplay(durationMinutes),
        distance_km: distanceKm,
        distance_display: route.localizedValues?.distance?.text ?? formatDistanceKm(distanceKm),
        traffic_aware: true,
      };
    } catch (error) {
      return {
        success: false as const,
        error: isAbortError(error)
          ? "Google Maps Routes request timed out."
          : error instanceof Error
            ? error.message
            : "Unknown drive-time error",
      };
    }
  },
};
