/**
 * Contract test for the bounded claim_due_triggers forward migration.
 * @module lib/triggers/__tests__/claim-due-triggers-batch-migration
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260413095500_limit_claim_due_triggers_batch.sql",
);

describe("claim_due_triggers batch limit migration", () => {
  it("caps one scanner tick to a bounded number of claims ordered by due time", () => {
    const migrationSql = readFileSync(migrationPath, "utf8");

    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.claim_due_triggers()");
    expect(migrationSql).toContain("v_claim_limit CONSTANT INTEGER := 25;");
    expect(migrationSql).toContain("ORDER BY next_fire_at ASC, created_at ASC");
    expect(migrationSql).toContain("LIMIT v_claim_limit");
  });
});
