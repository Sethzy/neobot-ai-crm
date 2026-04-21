/**
 * Contract tests for user-scoped Telegram pairing migrations.
 * @module supabase/migrations/__tests__/telegram-user-scoped-pairing-migrations
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const connectionMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260421100000_create_messaging_channel_connections.sql",
);
const sessionMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260421100001_create_telegram_pairing_sessions.sql",
);
const profileMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260421100002_ensure_user_profiles_and_add_default_messaging_thread_id.sql",
);
const backfillMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260421100003_backfill_telegram_connections_from_channel_mappings.sql",
);
const realtimeMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260421100004_enable_realtime_for_messaging_channel_connections.sql",
);

function readMigrationSql(path: string) {
  expect(existsSync(path)).toBe(true);
  return readFileSync(path, "utf8");
}

describe("Telegram user-scoped pairing migrations", () => {
  it("creates messaging_channel_connections with per-user ownership and sync fields", () => {
    const sql = readMigrationSql(connectionMigrationPath);

    expect(sql).toContain("CREATE TABLE public.messaging_channel_connections");
    expect(sql).toContain("user_id uuid NOT NULL");
    expect(sql).toContain("target_thread_id uuid NOT NULL");
    expect(sql).toContain("UNIQUE (user_id, channel)");
    expect(sql).toContain("UNIQUE (channel, external_conversation_id)");
    expect(sql).toContain("ALTER TABLE public.messaging_channel_connections ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("CREATE POLICY messaging_channel_connections_select_own");
    expect(sql).toContain("CREATE POLICY messaging_channel_connections_insert_own");
    expect(sql).toContain("CREATE POLICY messaging_channel_connections_update_own");
    expect(sql).toContain("CREATE POLICY messaging_channel_connections_delete_own");
  });

  it("creates telegram_pairing_sessions with deep-link tokens and display codes", () => {
    const sql = readMigrationSql(sessionMigrationPath);

    expect(sql).toContain("CREATE TABLE public.telegram_pairing_sessions");
    expect(sql).toContain("deep_link_token text NOT NULL UNIQUE");
    expect(sql).toContain("display_code text NOT NULL UNIQUE");
    expect(sql).toContain("consumed_at timestamptz");
    expect(sql).toContain("ALTER TABLE public.telegram_pairing_sessions ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("CREATE POLICY telegram_pairing_sessions_select_own");
    expect(sql).toContain("CREATE POLICY telegram_pairing_sessions_insert_own");
    expect(sql).toContain("CREATE POLICY telegram_pairing_sessions_update_own");
    expect(sql).toContain("CREATE POLICY telegram_pairing_sessions_delete_own");
  });

  it("extends user_profiles with a default messaging thread and write policies", () => {
    const sql = readMigrationSql(profileMigrationPath);

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.user_profiles");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS default_messaging_thread_id uuid");
    expect(sql).toContain("ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("CREATE POLICY user_profiles_insert_own");
    expect(sql).toContain("CREATE POLICY user_profiles_update_own");
  });

  it("backfills user-scoped Telegram connections from legacy transport mappings", () => {
    const sql = readMigrationSql(backfillMigrationPath);

    expect(sql).toContain("INSERT INTO public.messaging_channel_connections");
    expect(sql).toContain("FROM public.conversation_channel_mappings");
    expect(sql).toContain("WHERE mappings.channel = 'telegram'");
    expect(sql).toContain("INSERT INTO public.user_profiles");
    expect(sql).toContain("default_messaging_thread_id");
  });

  it("enables realtime for messaging_channel_connections", () => {
    const sql = readMigrationSql(realtimeMigrationPath);

    expect(sql).toContain("messaging_channel_connections");
    expect(sql).toContain(
      "ALTER PUBLICATION supabase_realtime ADD TABLE public.messaging_channel_connections",
    );
  });
});
