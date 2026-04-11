/**
 * Contract tests for the run_scores idempotency migration.
 * @module supabase/migrations/__tests__/run-scores-idempotency
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260411123000_dedupe_run_scores.sql",
);

function readMigrationSql(): string {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("run_scores idempotency migration", () => {
  it("removes duplicate evaluator rows before adding the uniqueness constraint", () => {
    const sql = readMigrationSql();
    expect(sql).toMatch(/ROW_NUMBER\(\)\s+OVER\s*\(/i);
    expect(sql).toMatch(/PARTITION BY run_id,\s*evaluator_name,\s*score_type/i);
    expect(sql).toMatch(/DELETE FROM public\.run_scores/i);
  });

  it("adds a unique index for one evaluator row per run + score type", () => {
    const sql = readMigrationSql();
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_run_scores_run_evaluator_type\s+ON public\.run_scores\s*\(run_id,\s*evaluator_name,\s*score_type\)/i,
    );
  });
});
