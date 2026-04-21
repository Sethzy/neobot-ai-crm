/**
 * Contract tests for the auth redirect metadata migration on connections.
 * @module supabase/migrations/__tests__/add-auth-redirect-fields-to-connections
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260421093000_add_auth_redirect_fields_to_connections.sql",
);

function readMigrationSql() {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("auth redirect connection migration", () => {
  it("adds a temporary redirect URL column", () => {
    const migrationSql = readMigrationSql();

    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS auth_redirect_url TEXT");
    expect(migrationSql).toContain("Temporary Composio-hosted sign-in URL");
  });

  it("adds a Composio-provided redirect expiry column", () => {
    const migrationSql = readMigrationSql();

    expect(migrationSql).toContain(
      "ADD COLUMN IF NOT EXISTS auth_redirect_expires_at TIMESTAMPTZ",
    );
    expect(migrationSql).toContain("Timestamp from Composio indicating when the temporary");
  });
});
