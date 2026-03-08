/**
 * Contract tests for the PR26a connection schema migration.
 * @module supabase/migrations/__tests__/pr26a-connection-schema-updates
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260308040000_pr26a_connection_schema_updates.sql",
);

function readMigrationSql() {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("PR26a connection schema migration", () => {
  it("widens status and adds the new metadata columns", () => {
    const migrationSql = readMigrationSql();

    expect(migrationSql).toContain("CHECK (status IN ('active', 'inactive', 'error', 'pending'))");
    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS account_identifier TEXT");
    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS activated_tools TEXT[] NOT NULL DEFAULT '{}'");
    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS tool_count INTEGER NOT NULL DEFAULT 0");
  });

  it("allows multiple active connections per toolkit while enforcing one pending flow", () => {
    const migrationSql = readMigrationSql();

    expect(migrationSql).toContain("DROP CONSTRAINT IF EXISTS connections_client_toolkit_unique");
    expect(migrationSql).toContain("DROP CONSTRAINT IF EXISTS connections_client_id_toolkit_slug_key");
    expect(migrationSql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_one_pending_per_toolkit");
    expect(migrationSql).toContain("WHERE status = 'pending'");
  });

  it("adds the client/status lookup index used by the query layer", () => {
    const migrationSql = readMigrationSql();

    expect(migrationSql).toContain("CREATE INDEX IF NOT EXISTS idx_connections_client_status");
    expect(migrationSql).toContain("ON public.connections (client_id, status)");
  });
});
