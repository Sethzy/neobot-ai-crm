/**
 * Contract tests for the PR25 connections migration.
 * @module supabase/migrations/__tests__/connections-migration
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260307160000_create_connections.sql",
);

function readMigrationSql() {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("PR25 connections migration", () => {
  it("creates the connections table with the trimmed metadata shape", () => {
    const migrationSql = readMigrationSql();

    expect(migrationSql).toContain("CREATE TABLE public.connections");
    expect(migrationSql).toContain("client_id UUID NOT NULL REFERENCES public.clients(client_id)");
    expect(migrationSql).toContain("composio_connected_account_id TEXT NOT NULL UNIQUE");
    expect(migrationSql).toContain("toolkit_slug TEXT NOT NULL");
    expect(migrationSql).toContain("display_name TEXT");
    expect(migrationSql).toContain("status TEXT NOT NULL DEFAULT 'active'");
    expect(migrationSql).toContain("CHECK (status IN ('active', 'inactive', 'error'))");
    expect(migrationSql).not.toContain("enabled_tools");
    expect(migrationSql).not.toContain("provider TEXT");
  });

  it("uses the project RLS and updated_at conventions", () => {
    const migrationSql = readMigrationSql();

    expect(migrationSql).toContain("ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY");
    expect(migrationSql).toContain("USING (client_id = public.get_my_client_id())");
    expect(migrationSql).toContain("WITH CHECK (client_id = public.get_my_client_id())");
    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.update_connections_updated_at()");
    expect(migrationSql).toContain("CREATE TRIGGER trg_connections_updated_at");
  });

  it("patches get_system_reminder_context with named active toolkits without changing the auth guard", () => {
    const migrationSql = readMigrationSql();

    expect(migrationSql).toContain("'active_connection_toolkits'");
    expect(migrationSql).toContain("jsonb_agg(conn.toolkit_slug ORDER BY conn.toolkit_slug)");
    expect(migrationSql).toContain("FROM public.connections AS conn");
    expect(migrationSql).toContain("conn.status = 'active'");
    expect(migrationSql).toContain("WHERE c.client_id = p_client_id");
    expect(migrationSql).toContain("auth.role() = 'service_role'");
    expect(migrationSql).toContain("OR p_client_id = public.get_my_client_id()");
  });
});
