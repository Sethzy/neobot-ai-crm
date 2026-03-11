/**
 * Contract tests for the PR38c message quota migration.
 * @module supabase/migrations/__tests__/message-quota-migration
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260311010000_create_message_quota.sql",
);

function readMigrationSql() {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("PR38c message quota migration", () => {
  it("creates the monthly usage table with the expected key and counters", () => {
    const sql = readMigrationSql();

    expect(sql).toContain("CREATE TABLE public.client_message_usage_monthly");
    expect(sql).toContain("client_id      uuid NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE");
    expect(sql).toContain("period_start   date NOT NULL");
    expect(sql).toContain("messages_used  integer NOT NULL DEFAULT 0");
    expect(sql).toContain("CHECK (messages_used >= 0)");
    expect(sql).toContain("PRIMARY KEY (client_id, period_start)");
  });

  it("creates quota RPCs using the Singapore month boundary and explicit plan limits", () => {
    const sql = readMigrationSql();

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.get_message_quota_status(");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.consume_message_quota(");
    expect(sql).toContain("timezone('Asia/Singapore', now())");
    expect(sql).toContain("WHEN 'Pro' THEN 500");
    expect(sql).toContain("WHEN 'Max' THEN 2000");
    expect(sql).toContain("ELSE 100");
  });

  it("guards RPC access and exposes only the intended execute grants", () => {
    const sql = readMigrationSql();

    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("auth.role() <> 'service_role'");
    expect(sql).toContain("p_client_id <> public.get_my_client_id()");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.get_message_quota_status(UUID) TO authenticated, service_role;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.consume_message_quota(UUID) TO authenticated, service_role;");
  });
});
