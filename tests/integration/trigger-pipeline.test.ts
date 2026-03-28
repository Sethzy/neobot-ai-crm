/**
 * Integration test: trigger claim/release pipeline.
 * Tests claim_due_triggers, release_trigger_claim, release_stale_trigger_claims
 * RPCs against real Postgres via local Supabase.
 *
 * Skipped automatically when local Supabase is not running.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import { releaseTriggerClaim } from "@/lib/triggers/schemas";

import { cleanupAll, cleanupAuthUsers } from "./helpers/cleanup";
import { seedClient, seedThread, type SeededClient, type SeededThread } from "./helpers/seed";
import {
  createServiceClient,
  isSupabaseRunning,
  type TestSupabaseClient,
} from "./helpers/supabase-local";

const canRun = await isSupabaseRunning();

let supabase: TestSupabaseClient;
let client: SeededClient;
let thread: SeededThread;

beforeAll(async () => {
  supabase = createServiceClient();
});

afterAll(async () => {
  if (canRun) {
    await cleanupAll(supabase);
    await cleanupAuthUsers(supabase);
  }
});

beforeEach(async () => {
  if (!canRun) return;
  await cleanupAll(supabase);
  await cleanupAuthUsers(supabase);
  client = await seedClient(supabase);
  thread = await seedThread(supabase, client.clientId);
});

/** Inserts a trigger row and returns the trigger ID. */
async function insertTrigger(
  opts: {
    nextFireAt?: string;
    cronExpression?: string;
    triggerType?: string;
    enabled?: boolean;
    retryCount?: number;
    currentRunId?: string | null;
    lastFiredAt?: string | null;
    payload?: Record<string, unknown>;
  } = {},
) {
  const { data, error } = await supabase
    .from("agent_triggers")
    .insert({
      client_id: client.clientId,
      thread_id: thread.threadId,
      trigger_type: opts.triggerType ?? "schedule",
      name: "Test Trigger",
      cron_expression: opts.cronExpression ?? "0 9 * * *",
      instruction_path: "instructions/test.md",
      next_fire_at: opts.nextFireAt ?? new Date(Date.now() - 60_000).toISOString(),
      enabled: opts.enabled ?? true,
      retry_count: opts.retryCount ?? 0,
      current_run_id: opts.currentRunId ?? null,
      last_fired_at: opts.lastFiredAt ?? null,
      payload: opts.payload ?? {},
    })
    .select("id")
    .single();

  if (error) throw new Error(`insertTrigger: ${error.message}`);
  return data.id;
}

describe.runIf(canRun)("Trigger Pipeline — claim_due_triggers", () => {
  it("claims a due trigger (next_fire_at in the past)", async () => {
    const triggerId = await insertTrigger({
      nextFireAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const { data, error } = await supabase.rpc("claim_due_triggers");
    expect(error).toBeNull();

    const claimed = data as Array<{ id: string; current_run_id: string }>;
    expect(claimed).toHaveLength(1);
    expect(claimed[0].id).toBe(triggerId);
    expect(claimed[0].current_run_id).toBeTruthy();
  });

  it("does not claim triggers with next_fire_at in the future", async () => {
    await insertTrigger({
      nextFireAt: new Date(Date.now() + 3600_000).toISOString(),
    });

    const { data } = await supabase.rpc("claim_due_triggers");
    expect(data).toHaveLength(0);
  });

  it("does not claim disabled triggers", async () => {
    await insertTrigger({
      nextFireAt: new Date(Date.now() - 60_000).toISOString(),
      enabled: false,
    });

    const { data } = await supabase.rpc("claim_due_triggers");
    expect(data).toHaveLength(0);
  });

  it("does not claim already-claimed triggers", async () => {
    await insertTrigger({
      nextFireAt: new Date(Date.now() - 60_000).toISOString(),
      currentRunId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    });

    const { data } = await supabase.rpc("claim_due_triggers");
    expect(data).toHaveLength(0);
  });

  it("claims multiple due triggers atomically", async () => {
    await insertTrigger({ nextFireAt: new Date(Date.now() - 120_000).toISOString() });
    await insertTrigger({ nextFireAt: new Date(Date.now() - 60_000).toISOString() });
    await insertTrigger({ nextFireAt: new Date(Date.now() + 60_000).toISOString() }); // future — not claimed

    const { data } = await supabase.rpc("claim_due_triggers");
    expect(data).toHaveLength(2);
  });
});

describe.runIf(canRun)("Trigger Pipeline — release_trigger_claim", () => {
  it("releases a claim and sets status to completed", async () => {
    const triggerId = await insertTrigger();
    const { data: claimed } = await supabase.rpc("claim_due_triggers");
    const runId = claimed![0].current_run_id;

    const nextFireAt = new Date(Date.now() + 86400_000).toISOString();
    await releaseTriggerClaim(supabase, triggerId, runId, "completed", {
      nextFireAt,
      advanceNextFireAt: true,
    });

    // Verify trigger state
    const { data: trigger } = await supabase
      .from("agent_triggers")
      .select("current_run_id, last_status, next_fire_at, retry_count, enabled")
      .eq("id", triggerId)
      .single();

    expect(trigger!.current_run_id).toBeNull();
    expect(trigger!.last_status).toBe("completed");
    expect(trigger!.retry_count).toBe(0);
    expect(trigger!.enabled).toBe(true);
    expect(new Date(trigger!.next_fire_at!).getTime()).toBeCloseTo(
      new Date(nextFireAt).getTime(),
      -3, // within 1 second
    );
  });

  it("does not release if run_id mismatches (claim_mismatch protection)", async () => {
    const triggerId = await insertTrigger();
    await supabase.rpc("claim_due_triggers");

    // Try to release with a wrong run_id
    const { data, error } = await supabase.rpc("release_trigger_claim", {
      p_trigger_id: triggerId,
      p_run_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      p_status: "completed",
      p_next_fire_at: null,
      p_advance_next_fire_at: true,
    });

    expect(error).toBeNull();
    expect(data).toBe(false); // no rows matched

    // Trigger still claimed
    const { data: trigger } = await supabase
      .from("agent_triggers")
      .select("current_run_id")
      .eq("id", triggerId)
      .single();

    expect(trigger!.current_run_id).not.toBeNull();
  });

  it("increments retry_count on dispatch_failed", async () => {
    const triggerId = await insertTrigger({ retryCount: 0 });
    const { data: claimed } = await supabase.rpc("claim_due_triggers");
    const runId = claimed![0].current_run_id;

    // Release with dispatch_failed and advanceNextFireAt=false (non-pulse)
    await releaseTriggerClaim(supabase, triggerId, runId, "dispatch_failed", {
      advanceNextFireAt: false,
    });

    const { data: trigger } = await supabase
      .from("agent_triggers")
      .select("retry_count, last_status, enabled")
      .eq("id", triggerId)
      .single();

    expect(trigger!.retry_count).toBe(1);
    expect(trigger!.last_status).toBe("dispatch_failed");
    expect(trigger!.enabled).toBe(true);
  });

  it("failed_permanent disables the trigger and resets retry_count", async () => {
    const triggerId = await insertTrigger({ retryCount: 2 });
    const { data: claimed } = await supabase.rpc("claim_due_triggers");
    const runId = claimed![0].current_run_id;

    await releaseTriggerClaim(supabase, triggerId, runId, "failed_permanent", {
      advanceNextFireAt: false,
    });

    const { data: trigger } = await supabase
      .from("agent_triggers")
      .select("retry_count, last_status, enabled")
      .eq("id", triggerId)
      .single();

    expect(trigger!.retry_count).toBe(0);
    expect(trigger!.last_status).toBe("failed_permanent");
    expect(trigger!.enabled).toBe(false);
  });

  it("completed resets retry_count to 0", async () => {
    const triggerId = await insertTrigger({ retryCount: 5 });
    const { data: claimed } = await supabase.rpc("claim_due_triggers");
    const runId = claimed![0].current_run_id;

    const nextFireAt = new Date(Date.now() + 86400_000).toISOString();
    await releaseTriggerClaim(supabase, triggerId, runId, "completed", {
      nextFireAt,
      advanceNextFireAt: true,
    });

    const { data: trigger } = await supabase
      .from("agent_triggers")
      .select("retry_count")
      .eq("id", triggerId)
      .single();

    expect(trigger!.retry_count).toBe(0);
  });
});

describe.runIf(canRun)("Trigger Pipeline — release_stale_trigger_claims", () => {
  it("releases claims older than stale threshold", async () => {
    // Insert a trigger that was claimed 20 minutes ago
    const triggerId = await insertTrigger({
      currentRunId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      lastFiredAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    });

    const { data: released } = await supabase.rpc(
      "release_stale_trigger_claims",
      { p_stale_minutes: 15 },
    );

    expect(released).toBe(1);

    // Verify trigger is unclaimed
    const { data: trigger } = await supabase
      .from("agent_triggers")
      .select("current_run_id, last_status")
      .eq("id", triggerId)
      .single();

    expect(trigger!.current_run_id).toBeNull();
    expect(trigger!.last_status).toBe("stale_released");
  });

  it("does not release fresh claims", async () => {
    await insertTrigger({
      currentRunId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      lastFiredAt: new Date(Date.now() - 5 * 60_000).toISOString(), // 5 min ago
    });

    const { data: released } = await supabase.rpc(
      "release_stale_trigger_claims",
      { p_stale_minutes: 15 },
    );

    expect(released).toBe(0);
  });
});

describe.runIf(canRun)("Trigger Pipeline — Full Claim-Release Cycle", () => {
  it("claim → dispatch → release → re-claim", async () => {
    const triggerId = await insertTrigger();

    // Claim
    const { data: firstClaim } = await supabase.rpc("claim_due_triggers");
    expect(firstClaim).toHaveLength(1);
    const firstRunId = firstClaim![0].current_run_id;

    // Release with next fire time in the past (simulating immediate re-fire)
    const pastNextFire = new Date(Date.now() - 1000).toISOString();
    await releaseTriggerClaim(supabase, triggerId, firstRunId, "completed", {
      nextFireAt: pastNextFire,
      advanceNextFireAt: true,
    });

    // Re-claim (next_fire_at is now in the past again)
    const { data: secondClaim } = await supabase.rpc("claim_due_triggers");
    expect(secondClaim).toHaveLength(1);
    expect(secondClaim![0].current_run_id).not.toBe(firstRunId);
  });
});
