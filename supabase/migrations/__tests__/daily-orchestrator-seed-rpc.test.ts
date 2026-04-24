/**
 * Contract tests for the atomic Daily Orchestrator seed RPC migration.
 * @module supabase/migrations/__tests__/daily-orchestrator-seed-rpc
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260424220000_add_atomic_daily_orchestrator_seed.sql",
);
const migrationSql = readFileSync(migrationPath, "utf8");

describe("Daily Orchestrator seed rpc migration", () => {
  it("creates the atomic seed rpc", () => {
    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.seed_default_daily_orchestrator");
    expect(migrationSql).toContain("FOR UPDATE");
    expect(migrationSql).toContain("INSERT INTO public.agent_triggers");
    expect(migrationSql).toContain("UPDATE public.clients");
    expect(migrationSql).toContain("SET daily_orchestrator_seeded_at = NOW()");
  });

  it("keeps the rpc service-role-only", () => {
    expect(migrationSql).toContain("GRANT EXECUTE ON FUNCTION public.seed_default_daily_orchestrator");
    expect(migrationSql).toContain("TO service_role;");
  });
});
