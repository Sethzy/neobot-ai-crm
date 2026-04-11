/**
 * Tests for the run-scores aggregation helper used by the admin dashboard.
 * @module lib/admin/__tests__/scores-query.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const scoresQueryMocks = vi.hoisted(() => ({
  gte: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: scoresQueryMocks.createAdminClient,
}));

import { fetchRecentScores } from "../scores-query";

describe("fetchRecentScores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00Z"));

    scoresQueryMocks.gte.mockResolvedValue({
      data: [],
      error: null,
    });
    scoresQueryMocks.select.mockReturnValue({
      gte: scoresQueryMocks.gte,
    });
    scoresQueryMocks.from.mockReturnValue({
      select: scoresQueryMocks.select,
    });
    scoresQueryMocks.createAdminClient.mockResolvedValue({
      from: scoresQueryMocks.from,
    });
  });

  it("groups rows by day, evaluator, and score type", async () => {
    scoresQueryMocks.gte.mockResolvedValueOnce({
      data: [
        {
          run_id: "run-1",
          evaluator_name: "safety-gate",
          score_type: "boolean",
          score_value: 1,
          created_at: "2026-04-09T10:00:00Z",
        },
        {
          run_id: "run-2",
          evaluator_name: "safety-gate",
          score_type: "boolean",
          score_value: 0,
          created_at: "2026-04-09T11:00:00Z",
        },
        {
          run_id: "run-3",
          evaluator_name: "crm-hallucination",
          score_type: "boolean",
          score_value: 1,
          created_at: "2026-04-09T12:00:00Z",
        },
        {
          run_id: "run-4",
          evaluator_name: "crm-hallucination",
          score_type: "scalar",
          score_value: 0.4,
          created_at: "2026-04-09T13:00:00Z",
        },
      ],
      error: null,
    });

    const rows = await fetchRecentScores({ days: 30 });

    expect(scoresQueryMocks.from).toHaveBeenCalledWith("run_scores");
    expect(scoresQueryMocks.select).toHaveBeenCalledWith(
      "run_id, evaluator_name, score_type, score_value, created_at",
    );
    expect(scoresQueryMocks.gte).toHaveBeenCalledWith(
      "created_at",
      "2026-03-11T12:00:00.000Z",
    );
    expect(rows).toEqual([
      {
        day: "2026-04-09",
        evaluator_name: "crm-hallucination",
        score_type: "boolean",
        avg_score: 1,
        run_count: 1,
      },
      {
        day: "2026-04-09",
        evaluator_name: "crm-hallucination",
        score_type: "scalar",
        avg_score: 0.4,
        run_count: 1,
      },
      {
        day: "2026-04-09",
        evaluator_name: "safety-gate",
        score_type: "boolean",
        avg_score: 0.5,
        run_count: 2,
      },
    ]);
  });

  it("skips rows with null scores", async () => {
    scoresQueryMocks.gte.mockResolvedValueOnce({
      data: [
        {
          run_id: "run-1",
          evaluator_name: "safety-gate",
          score_type: "boolean",
          score_value: null,
          created_at: "2026-04-09T10:00:00Z",
        },
      ],
      error: null,
    });

    await expect(fetchRecentScores({ days: 30 })).resolves.toEqual([]);
  });

  it("deduplicates duplicate evaluator rows for the same run", async () => {
    scoresQueryMocks.gte.mockResolvedValueOnce({
      data: [
        {
          run_id: "run-1",
          evaluator_name: "safety-gate",
          score_type: "boolean",
          score_value: 1,
          created_at: "2026-04-09T10:00:00Z",
        },
        {
          run_id: "run-1",
          evaluator_name: "safety-gate",
          score_type: "boolean",
          score_value: 1,
          created_at: "2026-04-09T10:00:05Z",
        },
        {
          run_id: "run-2",
          evaluator_name: "safety-gate",
          score_type: "boolean",
          score_value: 0,
          created_at: "2026-04-09T11:00:00Z",
        },
      ],
      error: null,
    });

    await expect(fetchRecentScores({ days: 30 })).resolves.toEqual([
      {
        day: "2026-04-09",
        evaluator_name: "safety-gate",
        score_type: "boolean",
        avg_score: 0.5,
        run_count: 2,
      },
    ]);
  });
});
