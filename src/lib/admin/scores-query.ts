/**
 * Read-only aggregation helper for the evaluator scores dashboard.
 *
 * The current H5 dashboard is intentionally simple: fetch recent `run_scores`
 * rows with a service-role client, then aggregate them in-process by day,
 * evaluator, and score type. If the dataset grows large, we can move this to a
 * SQL view later without changing the page contract.
 *
 * @module lib/admin/scores-query
 */
import { createAdminClient } from "@/lib/supabase/server";

export interface ScoreDashboardRow {
  day: string;
  evaluator_name: string;
  score_type: string;
  avg_score: number;
  run_count: number;
}

interface FetchRecentScoresOptions {
  days: number;
}

interface ScoreBucket {
  day: string;
  evaluator_name: string;
  score_type: string;
  sum: number;
  count: number;
}

export async function fetchRecentScores(
  options: FetchRecentScoresOptions,
): Promise<ScoreDashboardRow[]> {
  const supabase = await createAdminClient();
  const since = new Date(Date.now() - options.days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("run_scores")
    .select("evaluator_name, score_type, score_value, created_at")
    .gte("created_at", since);

  if (error) {
    throw new Error(`Failed to load run scores: ${error.message}`);
  }

  if (!data?.length) {
    return [];
  }

  const buckets = new Map<string, ScoreBucket>();

  for (const row of data) {
    if (typeof row.score_value !== "number") {
      continue;
    }

    const day = row.created_at.slice(0, 10);
    const key = `${day}__${row.evaluator_name}__${row.score_type}`;
    const bucket = buckets.get(key) ?? {
      day,
      evaluator_name: row.evaluator_name,
      score_type: row.score_type,
      sum: 0,
      count: 0,
    };

    bucket.sum += row.score_value;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  return Array.from(buckets.values())
    .map((bucket) => ({
      day: bucket.day,
      evaluator_name: bucket.evaluator_name,
      score_type: bucket.score_type,
      avg_score: bucket.count > 0 ? bucket.sum / bucket.count : 0,
      run_count: bucket.count,
    }))
    .sort((left, right) => {
      if (left.day !== right.day) {
        return left.day < right.day ? 1 : -1;
      }

      if (left.evaluator_name !== right.evaluator_name) {
        return left.evaluator_name.localeCompare(right.evaluator_name);
      }

      return left.score_type.localeCompare(right.score_type);
    });
}
