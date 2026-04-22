/**
 * Contract tests for the conversation thread last-read migration.
 * @module supabase/migrations/__tests__/conversation-thread-last-read
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260422120000_add_conversation_thread_last_read_at.sql",
);

function readMigrationSql(): string {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("conversation thread last-read migration", () => {
  it("adds a nullable last_read_at column to conversation_threads", () => {
    const sql = readMigrationSql();

    expect(sql).toMatch(
      /ALTER TABLE public\.conversation_threads\s+ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ/i,
    );
  });

  it("does not add new indexes or RLS policies", () => {
    const sql = readMigrationSql();

    expect(sql).not.toMatch(/CREATE INDEX/i);
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });
});
