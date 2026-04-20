/**
 * Tests for the stripped-down per-turn system reminder.
 * @module lib/runner/__tests__/system-reminder
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildSystemReminder } from "../system-reminder";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("buildSystemReminder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-12T14:30:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns only the current time", async () => {
    const result = await buildSystemReminder({} as never, CLIENT_ID);
    expect(result).toBe(
      "<system-reminder>\nCurrent time: 2026-04-12 14:30:00 UTC\n</system-reminder>",
    );
  });

  it("does not include connection state, tool counts, or legacy reminder blocks", async () => {
    const result = await buildSystemReminder({} as never, CLIENT_ID);

    expect(result).not.toMatch(/Active connections/);
    expect(result).not.toMatch(/tools active/);
    expect(result).not.toMatch(/User:/);
    expect(result).not.toMatch(/todos/i);
    expect(result).not.toMatch(/memory/i);
  });
});
