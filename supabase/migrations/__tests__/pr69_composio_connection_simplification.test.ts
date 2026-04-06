/**
 * Contract tests for the PR69 Composio connection simplification migration.
 * @module supabase/migrations/__tests__/pr69-composio-connection-simplification
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260406110000_pr69_composio_connection_simplification.sql",
);

function readMigrationSql() {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("PR69 Composio connection simplification migration", () => {
  it("enforces one connection per client and toolkit", () => {
    const migrationSql = readMigrationSql();

    expect(migrationSql).toContain("DROP INDEX IF EXISTS idx_connections_one_pending_per_toolkit");
    expect(migrationSql).toContain("ADD CONSTRAINT connections_client_toolkit_unique UNIQUE (client_id, toolkit_slug)");
  });

  it("drops the cached tool schema column", () => {
    const migrationSql = readMigrationSql();

    expect(migrationSql).toContain("DROP COLUMN IF EXISTS tool_schemas");
  });
});
