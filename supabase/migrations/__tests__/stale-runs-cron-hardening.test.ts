/**
 * Contract tests for the stale-runs cron hardening follow-up migration.
 * @module supabase/migrations/__tests__/stale-runs-cron-hardening
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260412113000_harden_stale_runs_cron.sql",
);

describe("stale runs cron hardening migration", () => {
  const migrationSql = readFileSync(migrationPath, "utf8");

  it("locks down execute access for the security definer sweep function", () => {
    expect(migrationSql).toContain("revoke execute on function public.sweep_stale_runs() from public;");
    expect(migrationSql).toContain("revoke execute on function public.sweep_stale_runs() from anon;");
    expect(migrationSql).toContain("revoke execute on function public.sweep_stale_runs() from authenticated;");
    expect(migrationSql).toContain("grant execute on function public.sweep_stale_runs() to postgres;");
  });

  it("adds a partial index aligned to the cron sweep predicate", () => {
    expect(migrationSql).toContain("create index if not exists idx_runs_running_created_at");
    expect(migrationSql).toContain("on public.runs (created_at)");
    expect(migrationSql).toContain("where status = 'running'");
  });
});
