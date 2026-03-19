/**
 * Contract tests for the PR50b browser profiles migration.
 * @module supabase/migrations/__tests__/browser-profiles-migration
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260319000000_create_browser_profiles.sql",
);

function readMigrationSql() {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("PR50b browser_profiles migration", () => {
  it("creates the browser_profiles table with the expected profile mapping columns", () => {
    const migrationSql = readMigrationSql();

    expect(migrationSql).toContain("CREATE TABLE public.browser_profiles");
    expect(migrationSql).toContain("client_id UUID NOT NULL REFERENCES public.clients(client_id)");
    expect(migrationSql).toContain("platform TEXT NOT NULL");
    expect(migrationSql).toContain("browser_use_profile_id TEXT NOT NULL");
    expect(migrationSql).toContain("label TEXT");
  });

  it("uses the expected uniqueness, rls, and updated_at conventions", () => {
    const migrationSql = readMigrationSql();

    expect(migrationSql).toContain("browser_profiles_client_platform_unique");
    expect(migrationSql).toContain("ALTER TABLE public.browser_profiles ENABLE ROW LEVEL SECURITY");
    expect(migrationSql).toContain("browser_profiles_select_own");
    expect(migrationSql).toContain("browser_profiles_insert_own");
    expect(migrationSql).toContain("browser_profiles_update_own");
    expect(migrationSql).toContain("browser_profiles_delete_own");
    expect(migrationSql).toContain("CREATE TRIGGER trg_browser_profiles_updated_at");
    expect(migrationSql).toContain("EXECUTE FUNCTION public.update_connections_updated_at()");
  });
});
