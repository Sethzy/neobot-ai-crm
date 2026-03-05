/**
 * Contract tests for the PR18 trigger RPC migration.
 * @module lib/triggers/__tests__/trigger-rpc-migration
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260306010001_create_trigger_rpc_functions.sql",
);
const migrationSql = readFileSync(migrationPath, "utf8");

describe("trigger RPC migration", () => {
  it("locks SECURITY DEFINER RPC execution down to service_role", () => {
    expect(migrationSql).toContain("SECURITY DEFINER");
    expect(migrationSql).toContain("auth.role() <> 'service_role'");
    expect(migrationSql).toContain(
      "REVOKE ALL ON FUNCTION public.claim_due_triggers() FROM PUBLIC, anon, authenticated, service_role;",
    );
    expect(migrationSql).toContain(
      "GRANT EXECUTE ON FUNCTION public.claim_due_triggers() TO service_role;",
    );
    expect(migrationSql).toContain(
      "REVOKE ALL ON FUNCTION public.release_stale_trigger_claims(INTEGER)",
    );
    expect(migrationSql).toContain(
      "GRANT EXECUTE ON FUNCTION public.release_stale_trigger_claims(INTEGER) TO service_role;",
    );
    expect(migrationSql).toContain(
      "REVOKE ALL ON FUNCTION public.release_trigger_claim(UUID, UUID, TEXT, TIMESTAMPTZ)",
    );
    expect(migrationSql).toContain(
      "GRANT EXECUTE ON FUNCTION public.release_trigger_claim(UUID, UUID, TEXT, TIMESTAMPTZ)",
    );
  });

  it("supports atomically advancing next_fire_at during claim release", () => {
    expect(migrationSql).toContain("p_next_fire_at TIMESTAMPTZ DEFAULT NULL");
    expect(migrationSql).toContain("next_fire_at = COALESCE(p_next_fire_at, next_fire_at)");
  });
});
