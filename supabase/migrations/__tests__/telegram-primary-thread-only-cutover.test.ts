/**
 * Contract tests for the Telegram primary-thread-only cleanup migration.
 * @module supabase/migrations/__tests__/telegram-primary-thread-only-cutover
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260422100000_telegram_primary_thread_only_cutover.sql",
);

function readMigrationSql() {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("Telegram primary-thread-only cutover migration", () => {
  it("clears pending Telegram question batches for drifted chats before repointing mappings", () => {
    const sql = readMigrationSql();

    expect(sql).toContain("DELETE FROM public.telegram_pending_questions");
    expect(sql).toContain("FROM public.conversation_channel_mappings AS mappings");
    expect(sql).toContain("WHERE mappings.channel = 'telegram'");
  });

  it("repoints all Telegram routing tables to the primary thread", () => {
    const sql = readMigrationSql();

    expect(sql).toContain("UPDATE public.conversation_channel_mappings AS mappings");
    expect(sql).toContain("UPDATE public.messaging_channel_connections AS connections");
    expect(sql).toContain("UPDATE public.telegram_pairing_sessions AS sessions");
    expect(sql).toContain("WHERE is_primary = true");
  });

  it("enforces one Telegram connection per client and drops the reverted override column", () => {
    const sql = readMigrationSql();

    expect(sql).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_messaging_channel_connections_client_telegram_unique",
    );
    expect(sql).toContain("DROP CONSTRAINT IF EXISTS user_profiles_default_messaging_thread_id_fkey");
    expect(sql).toContain("DROP INDEX IF EXISTS public.idx_user_profiles_default_messaging_thread_id");
    expect(sql).toContain("DROP COLUMN IF EXISTS default_messaging_thread_id");
  });
});
