/**
 * Tests for the webhook trigger claim helper.
 * @module lib/triggers/__tests__/webhook-claim
 */
import { describe, expect, it, vi } from "vitest";

import { claimWebhookTrigger } from "../webhook-claim";

function createMockSupabase() {
  const claimChain = {
    eq: vi.fn(() => claimChain),
    is: vi.fn(() => claimChain),
    select: vi.fn(() => claimChain),
    maybeSingle: vi.fn(),
  };
  const update = vi.fn(() => claimChain);

  return {
    from: vi.fn((table: string) => {
      if (table === "agent_triggers") {
        return {
          update,
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    claimChain,
    update,
  };
}

describe("claimWebhookTrigger", () => {
  it("claims an enabled idle webhook trigger and returns the new run id", async () => {
    const supabase = createMockSupabase();
    supabase.claimChain.maybeSingle.mockResolvedValue({
      data: {
        current_run_id: "run-123",
      },
      error: null,
    });

    const result = await claimWebhookTrigger(supabase as never, "trigger-123");

    expect(supabase.update).toHaveBeenCalledWith({
      current_run_id: expect.any(String),
      last_fired_at: expect.any(String),
    });
    expect(supabase.claimChain.eq).toHaveBeenCalledWith("id", "trigger-123");
    expect(supabase.claimChain.eq).toHaveBeenCalledWith("trigger_type", "webhook");
    expect(supabase.claimChain.eq).toHaveBeenCalledWith("enabled", true);
    expect(supabase.claimChain.is).toHaveBeenCalledWith("current_run_id", null);
    expect(result).toEqual({ currentRunId: "run-123" });
  });

  it("returns null when the trigger is already claimed or missing", async () => {
    const supabase = createMockSupabase();
    supabase.claimChain.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const result = await claimWebhookTrigger(supabase as never, "trigger-123");

    expect(result).toBeNull();
  });
});
