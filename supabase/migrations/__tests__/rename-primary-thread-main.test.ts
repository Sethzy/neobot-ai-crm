/**
 * Contract tests for the primary-thread rename migration.
 * @module supabase/migrations/__tests__/rename-primary-thread-main
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260422110000_rename_primary_thread_agent_to_main.sql",
);

function readMigrationSql() {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("Rename primary thread to Main migration", () => {
  it("updates ensure_autopilot_for_client to create and preserve Main threads", () => {
    const sql = readMigrationSql();

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.ensure_autopilot_for_client");
    expect(sql).toContain("title IN ('Main', 'Agent', 'Sunder Autopilot')");
    expect(sql).toContain("VALUES (p_client_id, 'Main', true, true)");
    expect(sql).toContain("title = 'Main'");
  });

  it("renames existing primary-thread rows from Agent to Main", () => {
    const sql = readMigrationSql();

    expect(sql).toContain("UPDATE public.conversation_threads");
    expect(sql).toContain("WHERE is_primary = true");
    expect(sql).toContain("AND title = 'Agent'");
  });
});
