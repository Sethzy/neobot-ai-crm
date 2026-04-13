/**
 * Tests for the Trigger.dev scan-triggers scheduled task.
 * @module src/trigger/__tests__/scan-triggers
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TriggerDispatchPayload } from "@/lib/triggers/schemas";

const {
  mockRunScan,
  mockCreateAdminClient,
  mockExecuteTrigger,
  mockLoggerInfo,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockRunScan: vi.fn(),
  mockCreateAdminClient: vi.fn().mockResolvedValue({ __role: "admin" }),
  mockExecuteTrigger: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock("@/lib/triggers/scanner", () => ({
  runScan: mockRunScan,
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock("@/lib/triggers/executor", () => ({
  executeTrigger: mockExecuteTrigger,
}));

vi.mock("@trigger.dev/sdk/v3", () => ({
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
  },
  schedules: {
    task: (definition: unknown) => definition,
  },
}));

const validPayload: TriggerDispatchPayload = {
  triggerId: "550e8400-e29b-41d4-a716-446655440000",
  clientId: "660e8400-e29b-41d4-a716-446655440000",
  threadId: "770e8400-e29b-41d4-a716-446655440000",
  currentRunId: "880e8400-e29b-41d4-a716-446655440000",
  triggerType: "schedule",
  triggerName: "Daily briefing",
  instructionPath: "state/triggers/daily-briefing.md",
  triggerPayload: {},
  nextFireAt: "2026-03-07T09:00:00.000Z",
};

import { scanTriggers } from "../scan-triggers";

describe("scanTriggers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    mockRunScan.mockResolvedValue({
      claimed: 0,
      dispatched: 0,
      staleReleased: 0,
      errors: [],
    });
    mockExecuteTrigger.mockResolvedValue({ status: "queued" });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("calls runScan with an admin Supabase client and execution callback", async () => {
    await scanTriggers.run({} as never, { ctx: {} as never });

    expect(mockCreateAdminClient).toHaveBeenCalledOnce();
    expect(mockRunScan).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase: { __role: "admin" },
        dispatch: expect.any(Function),
      }),
    );
  });

  it("returns and logs scan results", async () => {
    mockRunScan.mockResolvedValueOnce({
      claimed: 3,
      dispatched: 2,
      staleReleased: 1,
      errors: ["trigger-1: dispatch failed"],
    });

    const result = await scanTriggers.run({} as never, { ctx: {} as never });

    expect(result).toEqual({
      claimed: 3,
      dispatched: 2,
      staleReleased: 1,
      errors: ["trigger-1: dispatch failed"],
    });
    expect(mockLoggerInfo).toHaveBeenCalledWith("Scanner tick complete", {
      claimed: 3,
      dispatched: 2,
      staleReleased: 1,
      errors: ["trigger-1: dispatch failed"],
    });
  });

  it("execution callback calls executeTrigger directly with the shared admin client", async () => {
    mockRunScan.mockImplementationOnce(async ({ supabase, dispatch }) => {
      const result = await dispatch(validPayload);
      expect(result).toEqual({ ok: true, status: 200 });

      return { claimed: 1, dispatched: 1, staleReleased: 0, errors: [] };
    });

    await scanTriggers.run({} as never, { ctx: {} as never });

    expect(mockExecuteTrigger).toHaveBeenCalledWith({
      supabase: { __role: "admin" },
      payload: validPayload,
    });
  });

  it("execution callback returns claim-mismatch details on failure", async () => {
    mockExecuteTrigger.mockResolvedValueOnce({ status: "claim_mismatch" });
    mockRunScan.mockImplementationOnce(async ({ dispatch }) => {
      const result = await dispatch(validPayload);
      expect(result).toEqual({
        ok: false,
        status: 409,
        error: "Trigger claim no longer valid",
      });

      return { claimed: 1, dispatched: 0, staleReleased: 0, errors: ["failed"] };
    });

    await scanTriggers.run({} as never, { ctx: {} as never });
  });

  it("does not require a base URL or cron secret for internal execution", async () => {
    delete process.env.CRON_SECRET;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;

    await expect(
      scanTriggers.run({} as never, { ctx: {} as never }),
    ).resolves.toEqual({
      claimed: 0,
      dispatched: 0,
      staleReleased: 0,
      errors: [],
    });
  });

  it("propagates runScan errors", async () => {
    mockRunScan.mockRejectedValueOnce(new Error("DB connection failed"));

    await expect(
      scanTriggers.run({} as never, { ctx: {} as never }),
    ).rejects.toThrow("DB connection failed");
  });

  it("maps executor errors to dispatch failures", async () => {
    mockExecuteTrigger.mockRejectedValueOnce(new Error("spawn failed"));
    mockRunScan.mockImplementationOnce(async ({ dispatch }) => {
      const result = await dispatch(validPayload);
      expect(result).toEqual({
        ok: false,
        status: 500,
        error: "Execution failed: spawn failed",
      });

      return { claimed: 1, dispatched: 0, staleReleased: 0, errors: ["failed"] };
    });

    await scanTriggers.run({} as never, { ctx: {} as never });
  });
});
