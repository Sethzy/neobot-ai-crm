/**
 * @module lib/eval/__tests__/run-scores-writer.test
 *
 * Tests for the Supabase `run_scores` insert helper used by the in-process
 * evaluator pipeline.
 */
import { describe, it, expect, vi } from "vitest";

import { writeRunScore } from "../run-scores-writer";

function stubSupabase(upsertSpy: ReturnType<typeof vi.fn>) {
  return { from: vi.fn(() => ({ upsert: upsertSpy })) } as never;
}

describe("writeRunScore", () => {
  it("upserts a row into run_scores on the run/evaluator/type key", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    await writeRunScore(stubSupabase(upsert), "run_1", {
      evaluator_name: "safety-gate",
      score_type: "boolean",
      score_value: 1,
      comment: "ok",
    });
    expect(upsert).toHaveBeenCalledWith(
      {
        run_id: "run_1",
        evaluator_name: "safety-gate",
        score_type: "boolean",
        score_value: 1,
        comment: "ok",
      },
      {
        onConflict: "run_id,evaluator_name,score_type",
        ignoreDuplicates: false,
      },
    );
  });

  it("throws on DB error", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: "RLS denied" } });
    await expect(
      writeRunScore(stubSupabase(upsert), "run_1", {
        evaluator_name: "safety-gate",
        score_type: "boolean",
        score_value: 0,
      }),
    ).rejects.toThrow(/RLS denied/);
  });
});
