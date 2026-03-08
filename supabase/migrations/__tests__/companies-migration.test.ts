/**
 * Contract tests for the PR15d company-object migration.
 * @module supabase/migrations/__tests__/companies-migration
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260307000000_add_companies_table.sql",
);

describe("companies migration", () => {
  it("creates the companies table and nullable company links on contacts and deals", () => {
    const migrationSql = readFileSync(migrationPath, "utf8");

    expect(migrationSql).toContain("CREATE TABLE public.companies");
    expect(migrationSql).toContain("ALTER TABLE public.contacts");
    expect(migrationSql).toContain("ADD COLUMN company_id UUID REFERENCES public.companies(company_id) ON DELETE SET NULL");
    expect(migrationSql).toContain("ALTER TABLE public.deals");
    expect(migrationSql).toContain("ADD COLUMN company_id UUID REFERENCES public.companies(company_id) ON DELETE SET NULL");
  });

  it("extends crm_config with company vocabulary and custom field columns", () => {
    const migrationSql = readFileSync(migrationPath, "utf8");

    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS company_industries JSONB");
    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS company_custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb");
    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS company_label TEXT NOT NULL DEFAULT 'Company'");
  });

  it("uses existing CRM trigger and RLS conventions", () => {
    const migrationSql = readFileSync(migrationPath, "utf8");

    expect(migrationSql).toContain("EXECUTE FUNCTION update_updated_at_column()");
    expect(migrationSql).toContain("client_id = public.get_my_client_id()");
    expect(migrationSql).not.toContain("auth.uid()");
    expect(migrationSql).not.toContain("handle_updated_at()");
  });
});
