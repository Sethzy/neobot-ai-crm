/**
 * Contract tests for the CRM phone constraint relaxation migration.
 *
 * The database safety net must stay aligned with validatePhoneForSave():
 * - null is allowed
 * - canonical E.164 is allowed
 * - plausible raw local numbers are allowed when they contain at least 7 digits
 *
 * @module supabase/migrations/__tests__/crm-phone-constraints
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260424132000_relax_crm_phone_constraints.sql",
);

function readMigrationSql(): string {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("CRM phone constraint migration", () => {
  it("drops the old E.164-only constraints before adding the new ones", () => {
    const sql = readMigrationSql();

    expect(sql).toMatch(/ALTER TABLE contacts\s+DROP CONSTRAINT IF EXISTS contacts_phone_e164_format;/);
    expect(sql).toMatch(/ALTER TABLE companies\s+DROP CONSTRAINT IF EXISTS companies_phone_e164_format;/);
  });

  it("adds plausible phone constraints for both contacts and companies", () => {
    const sql = readMigrationSql();

    expect(sql).toMatch(/ADD CONSTRAINT contacts_phone_plausible_format/);
    expect(sql).toMatch(/ADD CONSTRAINT companies_phone_plausible_format/);
    expect(sql).toMatch(/phone IS NULL/);
    expect(sql).toMatch(/phone ~ '\^\\\+\[1-9\]\\d\{1,14\}\$'/);
    expect(sql).toMatch(/length\(regexp_replace\(phone, '\\D', '', 'g'\)\) >= 7/);
    expect(sql).toMatch(/NOT VALID;/);
  });
});
