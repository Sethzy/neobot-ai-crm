/**
 * Contract tests for the stale-runs pg_cron migration.
 * @module supabase/migrations/__tests__/stale-runs-cron
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260412110000_stale_runs_cron.sql",
);

describe("stale runs pg_cron migration", () => {
  const migrationSql = readFileSync(migrationPath, "utf8");

  it("enables pg_cron using Supabase's documented installation flow", () => {
    expect(migrationSql).toContain("create extension if not exists pg_cron with schema pg_catalog;");
    expect(migrationSql).toContain("grant usage on schema cron to postgres;");
    expect(migrationSql).toContain("grant all privileges on all tables in schema cron to postgres;");
  });

  it("creates a sweep function that mirrors mark_stale_runs_failed globally", () => {
    expect(migrationSql).toContain("create or replace function public.sweep_stale_runs()");
    expect(migrationSql).toContain("update public.runs");
    expect(migrationSql).toContain("set status = 'failed'");
    expect(migrationSql).toContain("completed_at = now()");
    expect(migrationSql).toContain("where status = 'running'");
    expect(migrationSql).toContain("created_at < now() - make_interval(mins => 15)");
  });

  it("schedules the sweep every 5 minutes under a stable job name", () => {
    expect(migrationSql).toContain("cron.schedule(");
    expect(migrationSql).toContain("'sweep-stale-runs'");
    expect(migrationSql).toContain("'*/5 * * * *'");
    expect(migrationSql.toLowerCase()).toContain("select public.sweep_stale_runs()");
  });
});
