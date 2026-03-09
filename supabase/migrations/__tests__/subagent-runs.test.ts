/**
 * Contract tests for the PR29 subagent run metadata migration.
 * @module supabase/migrations/__tests__/subagent-runs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260309010000_add_subagent_run_metadata.sql",
);

describe("PR29 subagent run metadata migration", () => {
  const migrationSql = readFileSync(migrationPath, "utf8");

  it("adds explicit run_type and parent_run_id columns to runs", () => {
    expect(migrationSql).toContain("ALTER TABLE public.runs");
    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS run_type TEXT NOT NULL DEFAULT 'chat'");
    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS parent_run_id UUID");
    expect(migrationSql).toContain("CHECK (run_type IN ('chat', 'webhook', 'cron', 'autopilot', 'subagent'))");
    expect(migrationSql).toContain("CHECK (parent_run_id IS NULL OR parent_run_id <> run_id)");
    expect(migrationSql).toContain("REFERENCES public.runs(run_id) ON DELETE SET NULL");
  });

  it("adds indexes that support child-run lookups without changing existing locking", () => {
    expect(migrationSql).toContain("CREATE INDEX IF NOT EXISTS idx_runs_run_type");
    expect(migrationSql).toContain("CREATE INDEX IF NOT EXISTS idx_runs_parent_run_id");
    expect(migrationSql).toContain("CREATE INDEX IF NOT EXISTS idx_runs_root_by_thread");
  });

  it("updates create_run_if_idle to persist the claimed run type", () => {
    expect(migrationSql).toContain("DROP FUNCTION IF EXISTS public.create_run_if_idle(UUID, UUID)");
    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.create_run_if_idle(");
    expect(migrationSql).toContain("p_run_type TEXT DEFAULT 'chat'");
    expect(migrationSql).toContain("INSERT INTO public.runs (run_id, thread_id, client_id, status, run_type)");
    expect(migrationSql).toContain("p_run_type");
    expect(migrationSql).toContain("COMMENT ON FUNCTION public.create_run_if_idle(UUID, UUID, TEXT)");
  });
});
