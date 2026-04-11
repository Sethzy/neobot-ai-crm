/**
 * Contract tests for the conversation_messages source_event_id index fix
 * migration.
 *
 * The H1 managed-agents foundation migration created
 * `uq_conversation_messages_thread_source_event` as a PARTIAL unique index
 * with `WHERE source_event_id IS NOT NULL`. That predicate made the index
 * unusable as an ON CONFLICT arbiter from supabase-js/.upsert() (PostgREST's
 * `onConflict` parameter only passes column names; Postgres requires partial
 * index predicates to be restated in the statement for inference). Every
 * call to `upsertMessage()` therefore 500'd with:
 *   "there is no unique or exclusion constraint matching the ON CONFLICT
 *    specification"
 *
 * This follow-up migration drops the partial index and recreates it as a
 * full (non-partial) unique index on the same columns. The tests below
 * guard against:
 *   - accidentally losing the DROP (which would leave the broken partial
 *     index in place on environments that already applied H1), and
 *   - someone re-adding the `WHERE source_event_id IS NOT NULL` predicate
 *     to the recreate, which would re-break arbiter inference.
 *
 * @module supabase/migrations/__tests__/conversation-messages-source-event-index-fix
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260412000000_fix_conversation_messages_source_event_index.sql",
);

function readMigrationSql(): string {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("conversation_messages source_event_id index fix migration", () => {
  it("drops the partial unique index from the H1 foundation migration", () => {
    const sql = readMigrationSql();
    expect(sql).toMatch(
      /DROP INDEX IF EXISTS public\.uq_conversation_messages_thread_source_event/i,
    );
  });

  it("recreates the index as a full (non-partial) unique index on (thread_id, source_event_id)", () => {
    const sql = readMigrationSql();
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_messages_thread_source_event\s+ON public\.conversation_messages\s*\(thread_id,\s*source_event_id\)\s*;/i,
    );
  });

  it("does NOT reintroduce a WHERE predicate on the recreated index", () => {
    // Regression guard: the whole point of this migration is to remove the
    // partial predicate so `.upsert({ onConflict: "thread_id,source_event_id" })`
    // can infer the index as an ON CONFLICT arbiter. A partial predicate of
    // any kind on the recreated index would re-break that inference.
    const sql = readMigrationSql();
    // Strip SQL line comments so we only inspect executable statements.
    const executable = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    const createStatementMatch = executable.match(
      /CREATE UNIQUE INDEX[^;]*uq_conversation_messages_thread_source_event[^;]*;/i,
    );
    expect(createStatementMatch).not.toBeNull();
    expect(createStatementMatch?.[0]).not.toMatch(/\bWHERE\b/i);
  });
});
