/** Tests for stale sprite cleanup logic. */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { cleanupStaleSprites } from "../sprite-jobs";

describe("cleanupStaleSprites", () => {
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60_000).toISOString();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function buildChain(resolvedData: unknown) {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.lt = vi.fn().mockReturnValue(chain);
    chain.in = vi.fn().mockReturnValue(chain);
    chain.update = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
    chain.then = vi.fn().mockImplementation((fn: (v: unknown) => unknown) =>
      Promise.resolve(fn({ data: resolvedData, error: null })),
    );
    return chain;
  }

  function createMockSupabase(staleSessions: unknown[], runningJobs: unknown[]) {
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === "sprite_sessions") {
        return buildChain(staleSessions);
      }
      if (table === "sprite_jobs") {
        return buildChain(runningJobs);
      }
      return buildChain([]);
    });
    return { from } as never;
  }

  it("destroys sprites inactive for more than 7 days", async () => {
    const mockDestroy = vi.fn().mockResolvedValue(undefined);
    const getSprite = vi.fn().mockReturnValue({ destroy: mockDestroy });
    const supabase = createMockSupabase(
      [{ sprite_name: "stale-sprite", last_active_at: tenDaysAgo }],
      [],
    );

    const result = await cleanupStaleSprites(supabase, getSprite);
    expect(result.destroyed).toBe(1);
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it("skips sprites with running jobs", async () => {
    const mockDestroy = vi.fn();
    const getSprite = vi.fn().mockReturnValue({ destroy: mockDestroy });
    const supabase = createMockSupabase(
      [{ sprite_name: "busy-sprite", last_active_at: tenDaysAgo }],
      [{ id: "job-1" }],
    );

    const result = await cleanupStaleSprites(supabase, getSprite);
    expect(result.destroyed).toBe(0);
    expect(mockDestroy).not.toHaveBeenCalled();
  });

  it("handles already-destroyed sprites gracefully", async () => {
    const mockDestroy = vi.fn().mockRejectedValue(new Error("not found"));
    const getSprite = vi.fn().mockReturnValue({ destroy: mockDestroy });
    const supabase = createMockSupabase(
      [{ sprite_name: "ghost-sprite", last_active_at: tenDaysAgo }],
      [],
    );

    const result = await cleanupStaleSprites(supabase, getSprite);
    expect(result.destroyed).toBe(1);
  });
});
