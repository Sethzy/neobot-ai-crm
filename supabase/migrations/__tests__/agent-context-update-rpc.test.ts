/**
 * Contract tests for the update_my_agent_context RPC migration.
 *
 * Locks the safety-critical shape of the function: SECURITY DEFINER,
 * auth.uid() row scoping, column whitelist via named parameters, and
 * the REVOKE/GRANT pair that keeps anon/service_role out.
 *
 * @module supabase/migrations/__tests__/agent-context-update-rpc
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260424130000_add_agent_context_update_rpc.sql",
);

function readMigrationSql(): string {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("update_my_agent_context RPC migration", () => {
  it("declares the function with SECURITY DEFINER and a locked search_path", () => {
    const sql = readMigrationSql();
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.update_my_agent_context/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = ''/);
  });

  it("scopes the UPDATE to the current auth user and only whitelisted columns", () => {
    const sql = readMigrationSql();
    expect(sql).toMatch(/UPDATE public\.clients/);
    expect(sql).toMatch(/WHERE user_id = auth\.uid\(\)/);

    // Extract just the SET ... WHERE block to assert the column whitelist
    // without tripping over `user_id` in the WHERE clause.
    const setBlock = sql.match(/SET\s+([\s\S]*?)\s+WHERE\s+user_id\s*=\s*auth\.uid\(\)/);
    expect(setBlock).not.toBeNull();
    const setList = setBlock![1];
    expect(setList).toMatch(/client_profile = COALESCE\(p_client_profile, client_profile\)/);
    expect(setList).toMatch(/user_preferences = COALESCE\(p_user_preferences, user_preferences\)/);
    expect(setList).not.toMatch(/\bplan_tier\b/);
    expect(setList).not.toMatch(/\bstripe_customer_id\b/);
    expect(setList).not.toMatch(/\buser_id\b/);
  });

  it("raises when no clients row matches the current auth user", () => {
    const sql = readMigrationSql();
    expect(sql).toMatch(/IF NOT FOUND THEN[\s\S]*?RAISE EXCEPTION/);
  });

  it("revokes default grants and only exposes EXECUTE to authenticated", () => {
    const sql = readMigrationSql();
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.update_my_agent_context\(text, text\)\s+FROM PUBLIC, anon, service_role/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.update_my_agent_context\(text, text\) TO authenticated/,
    );
  });
});
