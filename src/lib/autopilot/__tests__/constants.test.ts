/**
 * Tests for autopilot constants and config parsing.
 * @module lib/autopilot/__tests__/constants
 */
import { describe, expect, test } from "vitest";

import {
  AUTOPILOT_INSTRUCTION_PROMPT,
  AUTOPILOT_THREAD_TITLE,
  DEFAULT_PULSE_CRON,
  PULSE_INTERVAL_MAP,
  autopilotConfigSchema,
} from "../constants";

describe("autopilot constants", () => {
  test("uses the expected pinned autopilot thread title", () => {
    expect(AUTOPILOT_THREAD_TITLE).toBe("Sunder Autopilot");
  });

  test("uses the expected default 6 hour cron expression", () => {
    expect(DEFAULT_PULSE_CRON).toBe("0 */6 * * *");
  });

  test("maps supported intervals to cron expressions", () => {
    expect(PULSE_INTERVAL_MAP).toEqual({
      "1h": "0 * * * *",
      "2h": "0 */2 * * *",
      "6h": "0 */6 * * *",
      "12h": "0 */12 * * *",
    });
  });

  test("references only currently-available tool surfaces for bootstrap guidance", () => {
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("list_todo");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("search_tasks");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("search_deals");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).not.toContain("search_interactions");
  });

  test("includes the live-state bootstrap and noise suppression rules", () => {
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("MUST call tools");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("Never say \"nothing to do.\"");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("Avoid low-value pulses");
  });
});

describe("autopilotConfigSchema", () => {
  test("parses a complete config row with SQL TIME values", () => {
    const result = autopilotConfigSchema.parse({
      config_id: "550e8400-e29b-41d4-a716-446655440000",
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      pulse_interval: "6h",
      quiet_hours_start: "22:00:00",
      quiet_hours_end: "07:00:00",
      enabled: true,
      created_at: "2026-03-06T00:00:00+00:00",
      updated_at: "2026-03-06T00:00:00+00:00",
    });

    expect(result).toMatchObject({
      pulse_interval: "6h",
      quiet_hours_start: "22:00:00",
      quiet_hours_end: "07:00:00",
      enabled: true,
    });
  });

  test("accepts minute-precision time strings for app-side input", () => {
    expect(() =>
      autopilotConfigSchema.parse({
        config_id: "550e8400-e29b-41d4-a716-446655440000",
        client_id: "660e8400-e29b-41d4-a716-446655440000",
        pulse_interval: "1h",
        quiet_hours_start: "22:00",
        quiet_hours_end: "07:00",
        enabled: false,
        created_at: "2026-03-06T00:00:00+00:00",
        updated_at: "2026-03-06T00:00:00+00:00",
      }),
    ).not.toThrow();
  });

  test("rejects unsupported pulse intervals", () => {
    expect(() =>
      autopilotConfigSchema.parse({
        config_id: "550e8400-e29b-41d4-a716-446655440000",
        client_id: "660e8400-e29b-41d4-a716-446655440000",
        pulse_interval: "3h",
        quiet_hours_start: null,
        quiet_hours_end: null,
        enabled: true,
        created_at: "2026-03-06T00:00:00+00:00",
        updated_at: "2026-03-06T00:00:00+00:00",
      }),
    ).toThrow();
  });

  test("accepts disabled quiet hours", () => {
    const result = autopilotConfigSchema.parse({
      config_id: "550e8400-e29b-41d4-a716-446655440000",
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      pulse_interval: "12h",
      quiet_hours_start: null,
      quiet_hours_end: null,
      enabled: true,
      created_at: "2026-03-06T00:00:00+00:00",
      updated_at: "2026-03-06T00:00:00+00:00",
    });

    expect(result.quiet_hours_start).toBeNull();
    expect(result.quiet_hours_end).toBeNull();
  });
});
