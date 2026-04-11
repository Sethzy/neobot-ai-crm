/**
 * Contract tests for the H4 thread queue removal migration.
 * @module supabase/migrations/__tests__/drop-thread-queue-records-migration
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260410120000_drop_thread_queue_records.sql",
);

function readMigrationSql(): string {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("H4 drop thread_queue_records migration", () => {
  it("wraps the destructive changes in a transaction", () => {
    const sql = readMigrationSql();
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/^COMMIT;/m);
  });

  it("drops drain_thread_queue before dropping the table", () => {
    const sql = readMigrationSql();
    const dropFunctionIndex = sql.indexOf(
      "DROP FUNCTION IF EXISTS public.drain_thread_queue",
    );
    const dropTableIndex = sql.indexOf(
      "DROP TABLE IF EXISTS public.thread_queue_records",
    );

    expect(dropFunctionIndex).toBeGreaterThanOrEqual(0);
    expect(dropTableIndex).toBeGreaterThan(dropFunctionIndex);
  });

  it("uses CASCADE when dropping thread_queue_records", () => {
    const sql = readMigrationSql();
    expect(sql).toMatch(
      /DROP TABLE IF EXISTS public\.thread_queue_records CASCADE;/i,
    );
  });
});
