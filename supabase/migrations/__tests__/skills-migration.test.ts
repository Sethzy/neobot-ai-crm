/**
 * Contract tests for the unified skills metadata migration.
 * @module supabase/migrations/__tests__/skills-migration
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260413113000_create_skills_table.sql",
);

function readMigrationSql() {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("unified skills migration", () => {
  it("creates the skills metadata table with catalog and install-state fields", () => {
    const migrationSql = readMigrationSql();

    expect(migrationSql).toContain("CREATE TABLE public.skills");
    expect(migrationSql).toContain("client_id UUID REFERENCES public.clients(client_id) ON DELETE CASCADE");
    expect(migrationSql).toContain("slug TEXT NOT NULL");
    expect(migrationSql).toContain("is_predefined BOOLEAN NOT NULL DEFAULT false");
    expect(migrationSql).toContain("forked_from TEXT");
    expect(migrationSql).toContain("is_installed BOOLEAN NOT NULL DEFAULT true");
    expect(migrationSql).toContain("CONSTRAINT skills_unique_per_client UNIQUE (client_id, slug)");
    expect(migrationSql).toContain("CREATE UNIQUE INDEX skills_predefined_unique_slug");
  });

  it("adds RLS policies and an updated_at trigger", () => {
    const migrationSql = readMigrationSql();

    expect(migrationSql).toContain("ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY");
    expect(migrationSql).toContain("CREATE POLICY skills_select ON public.skills");
    expect(migrationSql).toContain("client_id IS NULL");
    expect(migrationSql).toContain("client_id = public.get_my_client_id()");
    expect(migrationSql).toContain("auth.role() = 'service_role'");
    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.update_skills_updated_at()");
    expect(migrationSql).toContain("SET search_path = public");
    expect(migrationSql).toContain("CREATE TRIGGER trg_skills_updated_at");
  });
});
