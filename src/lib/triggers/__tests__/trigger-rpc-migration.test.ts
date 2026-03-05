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
const forwardMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260306010002_harden_trigger_rpc_functions.sql",
);
const originalMigrationSql = readFileSync(migrationPath, "utf8");

describe("trigger RPC migration", () => {
  it("keeps the original timestamped migration immutable", () => {
    expect(originalMigrationSql).not.toContain("auth.role() <> 'service_role'");
    expect(originalMigrationSql).not.toContain("p_next_fire_at TIMESTAMPTZ DEFAULT NULL");
  });

  it("adds a forward migration that hardens RPC execution to service_role", () => {
    const forwardMigrationSql = readFileSync(forwardMigrationPath, "utf8");

    expect(forwardMigrationSql).toContain("SECURITY DEFINER");
    expect(forwardMigrationSql).toContain("auth.role() <> 'service_role'");
    expect(forwardMigrationSql).toContain(
      "REVOKE ALL ON FUNCTION public.claim_due_triggers() FROM PUBLIC, anon, authenticated, service_role;",
    );
    expect(forwardMigrationSql).toContain(
      "GRANT EXECUTE ON FUNCTION public.claim_due_triggers() TO service_role;",
    );
    expect(forwardMigrationSql).toContain(
      "REVOKE ALL ON FUNCTION public.release_stale_trigger_claims(INTEGER)",
    );
    expect(forwardMigrationSql).toContain(
      "GRANT EXECUTE ON FUNCTION public.release_stale_trigger_claims(INTEGER) TO service_role;",
    );
    expect(forwardMigrationSql).toContain(
      "REVOKE ALL ON FUNCTION public.release_trigger_claim(UUID, UUID, TEXT, TIMESTAMPTZ)",
    );
    expect(forwardMigrationSql).toContain(
      "GRANT EXECUTE ON FUNCTION public.release_trigger_claim(UUID, UUID, TEXT, TIMESTAMPTZ)",
    );
  });

  it("moves atomic next_fire_at advancement into the forward migration", () => {
    const forwardMigrationSql = readFileSync(forwardMigrationPath, "utf8");

    expect(forwardMigrationSql).toContain("p_next_fire_at TIMESTAMPTZ DEFAULT NULL");
    expect(forwardMigrationSql).toContain(
      "next_fire_at = COALESCE(p_next_fire_at, next_fire_at)",
    );
  });
});
