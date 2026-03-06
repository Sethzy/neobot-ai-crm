/**
 * Tests for cron scanner business logic.
 * @module lib/triggers/__tests__/scanner
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TriggerRow } from "../schemas";

const {
  mockComputeNextFireAt,
  MockInvalidCronExpressionError,
} = vi.hoisted(() => ({
  mockComputeNextFireAt: vi.fn(),
  MockInvalidCronExpressionError: class InvalidCronExpressionError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "InvalidCronExpressionError";
    }
  },
}));

vi.mock("../cron-utils", () => ({
  computeNextFireAt: mockComputeNextFireAt,
  InvalidCronExpressionError: MockInvalidCronExpressionError,
}));

import { runScan } from "../scanner";

function makeTriggerRow(overrides: Partial<TriggerRow> = {}): TriggerRow {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    thread_id: "770e8400-e29b-41d4-a716-446655440000",
    trigger_type: "schedule",
    name: "Daily briefing",
    cron_expression: "0 9 * * *",
    instruction_path: "state/triggers/daily-briefing.md",
    payload: {},
    enabled: true,
    current_run_id: "880e8400-e29b-41d4-a716-446655440000",
    next_fire_at: "2026-03-06T09:00:00.000Z",
    last_fired_at: "2026-03-06T09:00:00.000Z",
    last_status: null,
    created_at: "2026-03-05T00:00:00.000Z",
    updated_at: "2026-03-05T00:00:00.000Z",
    ...overrides,
  };
}

function createMockSupabase() {
  const mockUpdateEq = vi.fn().mockResolvedValue({ data: null, error: null });
  const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }));
  const autopilotConfigSelect = {
    eq: vi.fn(() => autopilotConfigSelect),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  return {
    rpc: vi.fn(),
    from: vi.fn((table: string) => {
      if (table === "agent_triggers") {
        return {
          update: mockUpdate,
        };
      }

      if (table === "autopilot_config") {
        return {
          select: vi.fn(() => autopilotConfigSelect),
        };
      }

      throw new Error(`Unexpected table access: ${table}`);
    }),
    mockUpdate,
    mockUpdateEq,
    autopilotConfigSelect,
  };
}

describe("runScan", () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let mockDispatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    mockDispatch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    mockComputeNextFireAt.mockReturnValue(new Date("2026-03-07T09:00:00.000Z"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns zero claimed when no triggers are due", async () => {
    mockSupabase.rpc.mockImplementation((name: string) => {
      if (name === "claim_due_triggers") {
        return Promise.resolve({ data: [], error: null });
      }

      if (name === "release_stale_trigger_claims") {
        return Promise.resolve({ data: 0, error: null });
      }

      return Promise.resolve({ data: null, error: null });
    });

    const result = await runScan({
      supabase: mockSupabase as never,
      dispatch: mockDispatch,
    });

    expect(result).toEqual({
      claimed: 0,
      dispatched: 0,
      staleReleased: 0,
      errors: [],
    });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("anchors next-fire computation to the claimed due time and dispatches successfully", async () => {
    const trigger = makeTriggerRow();

    mockSupabase.rpc.mockImplementation((name: string) => {
      if (name === "claim_due_triggers") {
        return Promise.resolve({ data: [trigger], error: null });
      }

      if (name === "release_trigger_claim") {
        return Promise.resolve({ data: true, error: null });
      }

      if (name === "release_stale_trigger_claims") {
        return Promise.resolve({ data: 0, error: null });
      }

      return Promise.resolve({ data: null, error: null });
    });

    const result = await runScan({
      supabase: mockSupabase as never,
      dispatch: mockDispatch,
    });

    expect(mockComputeNextFireAt).toHaveBeenCalledWith(
      "0 9 * * *",
      new Date("2026-03-06T09:00:00.000Z"),
    );
    expect(mockSupabase.mockUpdate).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerId: trigger.id,
        currentRunId: trigger.current_run_id,
        triggerType: "schedule",
        nextFireAt: "2026-03-07T09:00:00.000Z",
      }),
    );
    expect(result.dispatched).toBe(1);
  });

  it("does not advance next_fire_at when dispatch returns not ok", async () => {
    const trigger = makeTriggerRow();

    mockSupabase.rpc.mockImplementation((name: string, args?: Record<string, unknown>) => {
      if (name === "claim_due_triggers") {
        return Promise.resolve({ data: [trigger], error: null });
      }

      if (name === "release_trigger_claim") {
        return Promise.resolve({ data: true, error: null, args });
      }

      if (name === "release_stale_trigger_claims") {
        return Promise.resolve({ data: 0, error: null });
      }

      return Promise.resolve({ data: null, error: null });
    });

    mockDispatch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      error: "Execution failed: upstream crashed",
    });

    const result = await runScan({
      supabase: mockSupabase as never,
      dispatch: mockDispatch,
    });

    expect(mockSupabase.mockUpdate).not.toHaveBeenCalled();
    expect(mockSupabase.rpc).toHaveBeenCalledWith("release_trigger_claim", {
      p_next_fire_at: null,
      p_trigger_id: trigger.id,
      p_run_id: trigger.current_run_id,
      p_status: "dispatch_failed",
    });
    expect(result.dispatched).toBe(0);
    expect(result.errors).toEqual([
      `${trigger.id}: dispatch returned 500 (Execution failed: upstream crashed)`,
    ]);
  });

  it("disables invalid cron expressions and releases the claim", async () => {
    const trigger = makeTriggerRow({ cron_expression: "bad cron" });

    mockSupabase.rpc.mockImplementation((name: string) => {
      if (name === "claim_due_triggers") {
        return Promise.resolve({ data: [trigger], error: null });
      }

      if (name === "release_trigger_claim") {
        return Promise.resolve({ data: true, error: null });
      }

      if (name === "release_stale_trigger_claims") {
        return Promise.resolve({ data: 0, error: null });
      }

      return Promise.resolve({ data: null, error: null });
    });

    mockComputeNextFireAt.mockImplementationOnce(() => {
      throw new MockInvalidCronExpressionError("Cron parser rejected expression.");
    });

    const result = await runScan({
      supabase: mockSupabase as never,
      dispatch: mockDispatch,
    });

    expect(mockSupabase.mockUpdate).toHaveBeenCalledWith({
      enabled: false,
      last_status: "invalid_cron",
    });
    expect(mockSupabase.rpc).toHaveBeenCalledWith("release_trigger_claim", {
      p_next_fire_at: null,
      p_trigger_id: trigger.id,
      p_run_id: trigger.current_run_id,
      p_status: "invalid_cron",
    });
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(result.errors).toEqual([`${trigger.id}: invalid cron`]);
  });

  it("does not issue a separate next_fire_at update after successful schedule dispatch", async () => {
    const trigger = makeTriggerRow();

    mockSupabase.rpc.mockImplementation((name: string) => {
      if (name === "claim_due_triggers") {
        return Promise.resolve({ data: [trigger], error: null });
      }

      if (name === "release_trigger_claim") {
        return Promise.resolve({ data: true, error: null });
      }

      if (name === "release_stale_trigger_claims") {
        return Promise.resolve({ data: 0, error: null });
      }

      if (name === "release_trigger_claim") {
        return Promise.resolve({ data: true, error: null });
      }

      return Promise.resolve({ data: null, error: null });
    });

    await runScan({
      supabase: mockSupabase as never,
      dispatch: mockDispatch,
    });

    expect(mockSupabase.mockUpdate).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        nextFireAt: "2026-03-07T09:00:00.000Z",
      }),
    );
  });

  it("continues dispatching later triggers after one dispatch throws", async () => {
    const firstTrigger = makeTriggerRow();
    const secondTrigger = makeTriggerRow({
      id: "650e8400-e29b-41d4-a716-446655440000",
      current_run_id: "980e8400-e29b-41d4-a716-446655440000",
    });

    mockSupabase.rpc.mockImplementation((name: string) => {
      if (name === "claim_due_triggers") {
        return Promise.resolve({ data: [firstTrigger, secondTrigger], error: null });
      }

      if (name === "release_trigger_claim") {
        return Promise.resolve({ data: true, error: null });
      }

      if (name === "release_stale_trigger_claims") {
        return Promise.resolve({ data: 0, error: null });
      }

      return Promise.resolve({ data: null, error: null });
    });

    mockDispatch
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({ ok: true });

    const result = await runScan({
      supabase: mockSupabase as never,
      dispatch: mockDispatch,
      now: new Date("2026-03-06T14:00:00+08:00"),
    });

    expect(result.claimed).toBe(2);
    expect(result.dispatched).toBe(1);
    expect(result.errors).toEqual([`${firstTrigger.id}: network error`]);
  });

  it("throws when claim RPC fails", async () => {
    mockSupabase.rpc.mockImplementation((name: string) => {
      if (name === "claim_due_triggers") {
        return Promise.resolve({ data: null, error: { message: "DB error" } });
      }

      return Promise.resolve({ data: null, error: null });
    });

    await expect(
      runScan({
        supabase: mockSupabase as never,
        dispatch: mockDispatch,
      }),
    ).rejects.toThrow("Failed to claim due triggers: DB error");
  });

  it("dispatches pulse triggers outside quiet hours and advances the schedule", async () => {
    const trigger = makeTriggerRow({
      trigger_type: "pulse",
      cron_expression: "0 */6 * * *",
    });

    mockSupabase.autopilotConfigSelect.maybeSingle.mockResolvedValueOnce({
      data: {
        quiet_hours_start: "22:00:00",
        quiet_hours_end: "07:00:00",
      },
      error: null,
    });
    mockSupabase.rpc.mockImplementation((name: string) => {
      if (name === "claim_due_triggers") {
        return Promise.resolve({ data: [trigger], error: null });
      }

      if (name === "release_stale_trigger_claims") {
        return Promise.resolve({ data: 0, error: null });
      }

      return Promise.resolve({ data: null, error: null });
    });
    mockComputeNextFireAt.mockReturnValueOnce(new Date("2026-03-06T12:00:00.000Z"));

    const result = await runScan({
      supabase: mockSupabase as never,
      dispatch: mockDispatch,
      now: new Date("2026-03-06T14:00:00+08:00"),
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerType: "pulse",
        nextFireAt: "2026-03-06T12:00:00.000Z",
      }),
    );
    expect(mockSupabase.rpc).not.toHaveBeenCalledWith(
      "release_trigger_claim",
      expect.anything(),
    );
    expect(result.dispatched).toBe(1);
  });

  it("skips pulse triggers during quiet hours and advances to the next scheduled slot", async () => {
    const trigger = makeTriggerRow({
      trigger_type: "pulse",
      cron_expression: "0 */6 * * *",
      next_fire_at: "2026-03-06T06:00:00.000Z",
    });

    mockSupabase.autopilotConfigSelect.maybeSingle.mockResolvedValueOnce({
      data: {
        quiet_hours_start: "22:00:00",
        quiet_hours_end: "07:00:00",
      },
      error: null,
    });
    mockSupabase.rpc.mockImplementation((name: string) => {
      if (name === "claim_due_triggers") {
        return Promise.resolve({ data: [trigger], error: null });
      }

      if (name === "release_trigger_claim") {
        return Promise.resolve({ data: true, error: null });
      }

      if (name === "release_stale_trigger_claims") {
        return Promise.resolve({ data: 0, error: null });
      }

      return Promise.resolve({ data: null, error: null });
    });
    mockComputeNextFireAt.mockReturnValueOnce(new Date("2026-03-06T12:00:00.000Z"));

    const result = await runScan({
      supabase: mockSupabase as never,
      dispatch: mockDispatch,
      now: new Date("2026-03-05T22:30:00+08:00"),
    });

    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockSupabase.rpc).toHaveBeenCalledWith("release_trigger_claim", {
      p_next_fire_at: "2026-03-06T12:00:00.000Z",
      p_trigger_id: trigger.id,
      p_run_id: trigger.current_run_id,
      p_status: "skipped_quiet_hours",
    });
    expect(result.dispatched).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it("advances quiet-hours-skipped pulses until the next fire is after now", async () => {
    const trigger = makeTriggerRow({
      trigger_type: "pulse",
      cron_expression: "0 */6 * * *",
      next_fire_at: "2026-03-06T00:00:00.000Z",
    });

    mockSupabase.autopilotConfigSelect.maybeSingle.mockResolvedValueOnce({
      data: {
        quiet_hours_start: "22:00:00",
        quiet_hours_end: "07:00:00",
      },
      error: null,
    });
    mockSupabase.rpc.mockImplementation((name: string) => {
      if (name === "claim_due_triggers") {
        return Promise.resolve({ data: [trigger], error: null });
      }

      if (name === "release_trigger_claim") {
        return Promise.resolve({ data: true, error: null });
      }

      if (name === "release_stale_trigger_claims") {
        return Promise.resolve({ data: 0, error: null });
      }

      return Promise.resolve({ data: null, error: null });
    });
    mockComputeNextFireAt
      .mockReturnValueOnce(new Date("2026-03-06T06:00:00.000Z"))
      .mockReturnValueOnce(new Date("2026-03-06T12:00:00.000Z"))
      .mockReturnValueOnce(new Date("2026-03-06T18:00:00.000Z"));

    const result = await runScan({
      supabase: mockSupabase as never,
      dispatch: mockDispatch,
      now: new Date("2026-03-06T23:30:00+08:00"),
    });

    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockSupabase.rpc).toHaveBeenCalledWith("release_trigger_claim", {
      p_next_fire_at: "2026-03-06T18:00:00.000Z",
      p_trigger_id: trigger.id,
      p_run_id: trigger.current_run_id,
      p_status: "skipped_quiet_hours",
    });
    expect(result.dispatched).toBe(0);
    expect(result.errors).toEqual([]);
  });
});
