/**
 * Tests for autopilot constants and config parsing.
 * @module lib/autopilot/__tests__/constants
 */
import { describe, expect, test } from "vitest";

import {
  AUTOPILOT_INSTRUCTION_PROMPT,
  PRIMARY_THREAD_TITLE,
  DEFAULT_PULSE_CRON,
  PULSE_INTERVAL_MAP,
  autopilotConfigSchema,
} from "../constants";

describe("autopilot constants", () => {
  test("uses the expected primary thread title", () => {
    expect(PRIMARY_THREAD_TITLE).toBe("Agent");
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
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("search_crm");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).not.toContain("search_interactions");
  });

  test("includes the live-state bootstrap and noise suppression rules", () => {
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("Thread history is not current truth");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("Never end without a concrete next action");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("No filler");
  });

  test("includes memory continuity and after-acting persistence", () => {
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("memory files are your only continuity");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("AFTER ACTING");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("MEMORY.md");
  });

  test("overrides approval rules for autonomous execution", () => {
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("<approval-override>");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("The <safety> rules");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("MAY execute without approval");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("create_task");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("Do not use destructive tools");
  });

  test("still defers non-destructive CRM record mutations during autonomous pulses", () => {
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("MUST still describe and defer");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("creating or updating contacts");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("creating or updating deals");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("linking contacts to deals");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("batch operations");
  });

  test("uses /agent/ prefixes for memory file references", () => {
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("/agent/MEMORY.md");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("/agent/USER.md");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("/agent/memory/preferences.md");
    expect(AUTOPILOT_INSTRUCTION_PROMPT).toContain("/agent/memory/patterns.md");
  });

  test("does not contain bare memory file references without /agent/", () => {
    expect(AUTOPILOT_INSTRUCTION_PROMPT.match(/(?<!\/agent\/)MEMORY\.md/g) ?? []).toHaveLength(0);
    expect(AUTOPILOT_INSTRUCTION_PROMPT.match(/(?<!\/agent\/)USER\.md/g) ?? []).toHaveLength(0);
    expect(AUTOPILOT_INSTRUCTION_PROMPT.match(/(?<!\/agent\/)memory\//g) ?? []).toHaveLength(0);
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
      timezone: "Asia/Singapore",
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
        timezone: "Asia/Singapore",
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
        timezone: "Asia/Singapore",
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
      timezone: "Asia/Singapore",
      enabled: true,
      created_at: "2026-03-06T00:00:00+00:00",
      updated_at: "2026-03-06T00:00:00+00:00",
    });

    expect(result.quiet_hours_start).toBeNull();
    expect(result.quiet_hours_end).toBeNull();
  });
});
