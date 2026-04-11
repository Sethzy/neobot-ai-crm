/**
 * @module lib/eval/__tests__/run-scores-writer.test
 *
 * Tests for the Supabase `run_scores` insert helper. Replaces the legacy
 * Langfuse `createScore` path for the in-process evaluators.
 */
import { describe, it, expect, vi } from "vitest";

import { writeRunScore } from "../run-scores-writer";

function stubSupabase(insertSpy: ReturnType<typeof vi.fn>) {
  return { from: vi.fn(() => ({ insert: insertSpy })) } as never;
}

describe("writeRunScore", () => {
  it("inserts a row into run_scores", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    await writeRunScore(stubSupabase(insert), "run_1", {
      evaluator_name: "safety-gate",
      score_type: "boolean",
      score_value: 1,
      comment: "ok",
    });
    expect(insert).toHaveBeenCalledWith({
      run_id: "run_1",
      evaluator_name: "safety-gate",
      score_type: "boolean",
      score_value: 1,
      comment: "ok",
    });
  });

  it("throws on DB error", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "RLS denied" } });
    await expect(
      writeRunScore(stubSupabase(insert), "run_1", {
        evaluator_name: "safety-gate",
        score_type: "boolean",
        score_value: 0,
      }),
    ).rejects.toThrow(/RLS denied/);
  });
});
