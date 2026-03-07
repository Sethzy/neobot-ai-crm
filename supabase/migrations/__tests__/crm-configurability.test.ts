/**
 * Contract tests for the CRM configurability migration.
 * @module supabase/migrations/__tests__/crm-configurability
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260307100000_crm_configurability.sql",
);

describe("CRM configurability migration", () => {
  it("drops static CRM vocabulary check constraints", () => {
    const migrationSql = readFileSync(migrationPath, "utf8");

    expect(migrationSql).toContain("ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_type_check");
    expect(migrationSql).toContain("ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_stage_check");
    expect(migrationSql).toContain("ALTER TABLE public.interactions DROP CONSTRAINT IF EXISTS interactions_type_check");
    expect(migrationSql).toContain("ALTER TABLE public.deal_contacts DROP CONSTRAINT IF EXISTS deal_contacts_role_check");
  });

  it("normalizes legacy crm_config object arrays into string arrays", () => {
    const migrationSql = readFileSync(migrationPath, "utf8");

    expect(migrationSql).toContain("jsonb_array_elements(deal_stages)");
    expect(migrationSql).toContain("jsonb_array_elements(task_types)");
    expect(migrationSql).toContain("jsonb_array_elements(interaction_types)");
    expect(migrationSql).toContain("elem->>'id'");
  });

  it("adds new crm_config vocabulary and custom-field columns", () => {
    const migrationSql = readFileSync(migrationPath, "utf8");

    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS deal_label TEXT NOT NULL DEFAULT 'Deal'");
    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS contact_types JSONB");
    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS deal_contact_roles JSONB");
    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS deal_custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb");
    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS contact_custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb");
    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS task_custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb");
  });

  it("adds custom_fields JSONB columns to contacts, deals, and crm_tasks", () => {
    const migrationSql = readFileSync(migrationPath, "utf8");

    expect(migrationSql).toContain("ALTER TABLE public.contacts");
    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb");
    expect(migrationSql).toContain("ALTER TABLE public.deals");
    expect(migrationSql).toContain("ALTER TABLE public.crm_tasks");
  });
});
