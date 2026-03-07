/**
 * Contract tests for the clients display-name forward migration.
 * @module supabase/migrations/__tests__/clients-display-name-migration
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const originalMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260301000001_create_clients_trigger.sql",
);
const forwardMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260306190000_update_clients_display_name_fallback.sql",
);
const originalMigrationSql = readFileSync(originalMigrationPath, "utf8");

describe("clients display-name migration", () => {
  it("keeps the original clients trigger migration immutable", () => {
    expect(originalMigrationSql).not.toContain("raw_user_meta_data->>'full_name'");
    expect(originalMigrationSql).not.toContain("raw_user_meta_data->>'name'");
  });

  it("adds a forward migration that prefers social profile metadata before email", () => {
    const forwardMigrationSql = readFileSync(forwardMigrationPath, "utf8");

    expect(forwardMigrationSql).toContain("CREATE OR REPLACE FUNCTION public.handle_new_user()");
    expect(forwardMigrationSql).toContain("NEW.raw_user_meta_data->>'display_name'");
    expect(forwardMigrationSql).toContain("NEW.raw_user_meta_data->>'full_name'");
    expect(forwardMigrationSql).toContain("NEW.raw_user_meta_data->>'name'");
    expect(forwardMigrationSql).toContain("NEW.email");
  });
});
