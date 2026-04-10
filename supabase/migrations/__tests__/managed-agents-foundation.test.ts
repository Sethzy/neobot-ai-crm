/**
 * Contract tests for the H1 managed agents foundation migration.
 *
 * Verifies the additive-only schema changes land verbatim:
 * - runs.session_id + runs.events_cursor
 * - clients.client_profile + clients.user_preferences
 * - conversation_threads.session_id
 * - conversation_messages.source_event_id + unique index
 * - approval_events.session_id + approval_events.tool_use_id
 * - run_scores table + RLS + run_id index
 *
 * @module supabase/migrations/__tests__/managed-agents-foundation
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260410100000_managed_agents_foundation.sql",
);

function readMigrationSql(): string {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("H1 managed agents foundation migration", () => {
  it("is additive only - no DROP, no ALTER ... NOT NULL on existing columns", () => {
    const sql = readMigrationSql();
    expect(sql).not.toMatch(/DROP COLUMN/i);
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/ALTER COLUMN\s+\w+\s+SET NOT NULL/i);
  });

  it("adds session_id and events_cursor to runs", () => {
    const sql = readMigrationSql();
    expect(sql).toMatch(
      /ALTER TABLE public\.runs\s+ADD COLUMN IF NOT EXISTS session_id text/i,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.runs\s+ADD COLUMN IF NOT EXISTS events_cursor text/i,
    );
  });

  it("adds client_profile and user_preferences to clients", () => {
    const sql = readMigrationSql();
    expect(sql).toMatch(
      /ALTER TABLE public\.clients\s+ADD COLUMN IF NOT EXISTS client_profile text/i,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.clients\s+ADD COLUMN IF NOT EXISTS user_preferences text/i,
    );
  });

  it("adds session_id to conversation_threads", () => {
    const sql = readMigrationSql();
    expect(sql).toMatch(
      /ALTER TABLE public\.conversation_threads\s+ADD COLUMN IF NOT EXISTS session_id text/i,
    );
  });

  it("adds source_event_id + partial unique index to conversation_messages", () => {
    const sql = readMigrationSql();
    expect(sql).toMatch(
      /ALTER TABLE public\.conversation_messages\s+ADD COLUMN IF NOT EXISTS source_event_id text/i,
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_messages_thread_source_event\s+ON public\.conversation_messages\s*\(thread_id, source_event_id\)\s+WHERE source_event_id IS NOT NULL/i,
    );
  });

  it("adds session_id and tool_use_id to approval_events", () => {
    const sql = readMigrationSql();
    expect(sql).toMatch(
      /ALTER TABLE public\.approval_events\s+ADD COLUMN IF NOT EXISTS session_id text/i,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.approval_events\s+ADD COLUMN IF NOT EXISTS tool_use_id text/i,
    );
  });

  it("creates run_scores table with the expected columns and run_id index", () => {
    const sql = readMigrationSql();
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.run_scores");
    expect(sql).toMatch(
      /run_id\s+uuid\s+NOT NULL\s+REFERENCES public\.runs\(run_id\)/i,
    );
    expect(sql).toMatch(/evaluator_name\s+text\s+NOT NULL/i);
    expect(sql).toMatch(/score_type\s+text\s+NOT NULL/i);
    expect(sql).toMatch(/score_value\s+numeric/i);
    expect(sql).toMatch(/comment\s+text/i);
    expect(sql).toMatch(
      /created_at\s+timestamptz\s+NOT NULL\s+DEFAULT now\(\)/i,
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_run_scores_run_id\s+ON public\.run_scores\s*\(run_id\)/i,
    );
  });

  it("enables RLS on run_scores and grants SELECT to the owning client", () => {
    const sql = readMigrationSql();
    expect(sql).toContain(
      "ALTER TABLE public.run_scores ENABLE ROW LEVEL SECURITY",
    );
    expect(sql).toContain('CREATE POLICY "run_scores_select"');
    expect(sql).toMatch(
      /USING\s*\(\s*EXISTS\s*\(\s*SELECT 1\s+FROM public\.runs\s+WHERE runs\.run_id\s*=\s*run_scores\.run_id\s+AND runs\.client_id\s*=\s*public\.get_my_client_id\(\)\s*\)\s*\)/i,
    );
  });

  it("does not grant tenant INSERT/UPDATE/DELETE on run_scores in H1", () => {
    // Evaluator writes happen under service_role (which bypasses RLS), so
    // there is no legitimate reason for a tenant session to write to
    // run_scores in H1. Any future policy addition should be a conscious
    // decision in H2 with its own test update.
    const sql = readMigrationSql();
    expect(sql).not.toContain('CREATE POLICY "run_scores_insert"');
    expect(sql).not.toMatch(/CREATE POLICY\s+"run_scores_update"/i);
    expect(sql).not.toMatch(/CREATE POLICY\s+"run_scores_delete"/i);
    expect(sql).not.toMatch(/run_scores\s+FOR\s+INSERT/i);
  });
});
