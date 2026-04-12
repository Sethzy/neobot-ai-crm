/**
 * Contract tests for the final stale-runs cron execute lockdown migration.
 * @module supabase/migrations/__tests__/stale-runs-cron-execute-lockdown
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260412114000_lock_down_stale_runs_cron_execute.sql",
);

describe("stale runs cron execute lockdown migration", () => {
  const migrationSql = readFileSync(migrationPath, "utf8");

  it("revokes execute from service_role so only postgres keeps direct access", () => {
    expect(migrationSql).toContain(
      "revoke execute on function public.sweep_stale_runs() from service_role;",
    );
  });
});
