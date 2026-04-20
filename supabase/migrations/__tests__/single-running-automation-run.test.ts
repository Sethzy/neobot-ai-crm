/**
 * Contract test for the single-running-automation-run migration.
 * @module supabase/migrations/__tests__/single-running-automation-run
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260419110000_enforce_single_running_automation_per_trigger.sql",
);
const migrationSql = readFileSync(migrationPath, "utf8");

describe("single-running automation run migration", () => {
  it("deduplicates older running rows before creating the unique index", () => {
    expect(migrationSql).toContain("ROW_NUMBER() OVER (");
    expect(migrationSql).toContain("PARTITION BY runs.trigger_id");
    expect(migrationSql).toContain("LEFT JOIN public.agent_triggers AS agent_triggers");
    expect(migrationSql).toContain("WHEN agent_triggers.current_run_id = runs.run_id THEN 0");
    expect(migrationSql).toContain("status = 'failed'");
    expect(migrationSql).toContain(
      "completed_at = COALESCE(completed_at, now())",
    );
  });

  it("adds a partial unique index for running rows with a trigger_id", () => {
    expect(migrationSql).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_one_running_automation_per_trigger",
    );
    expect(migrationSql).toContain("ON public.runs(trigger_id)");
    expect(migrationSql).toContain(
      "WHERE trigger_id IS NOT NULL AND status = 'running'",
    );
  });
});
