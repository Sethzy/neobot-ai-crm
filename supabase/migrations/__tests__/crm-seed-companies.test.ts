/**
 * Contract tests for local CRM seed coverage after the company-object migration.
 * @module supabase/migrations/__tests__/crm-seed-companies
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const seedPath = join(process.cwd(), "supabase/seed.sql");
const seedSql = readFileSync(seedPath, "utf8");

describe("crm seed company coverage", () => {
  it("seeds companies and links contacts and deals to them", () => {
    expect(seedSql).toContain("INSERT INTO public.companies");
    expect(seedSql).toContain("company_id");
    expect(seedSql).toContain("INSERT INTO public.contacts");
    expect(seedSql).toContain("INSERT INTO public.deals");
  });

  it("seeds company crm config defaults for local dogfooding", () => {
    expect(seedSql).toContain("company_label");
    expect(seedSql).toContain("company_industries");
    expect(seedSql).toContain("company_custom_fields");
  });
});
