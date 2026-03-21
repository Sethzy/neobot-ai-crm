/**
 * Contract tests for Telegram channel migrations.
 * @module supabase/migrations/__tests__/telegram-channel-migrations
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const pairingTokensMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260320100000_create_telegram_pairing_tokens.sql",
);
const ownershipGuardMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260320100001_add_global_channel_mapping_ownership.sql",
);
const pendingQuestionsMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260320200000_create_telegram_pending_questions.sql",
);

function readMigrationSql(path: string) {
  expect(existsSync(path)).toBe(true);
  return readFileSync(path, "utf8");
}

describe("Telegram channel migrations", () => {
  it("creates telegram_pairing_tokens with RLS policies for authenticated settings access", () => {
    const sql = readMigrationSql(pairingTokensMigrationPath);

    expect(sql).toContain("CREATE TABLE public.telegram_pairing_tokens");
    expect(sql).toContain("client_id uuid NOT NULL");
    expect(sql).toContain("expires_at timestamptz NOT NULL");
    expect(sql).toContain("ALTER TABLE public.telegram_pairing_tokens ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("CREATE POLICY telegram_pairing_tokens_select_own");
    expect(sql).toContain("CREATE POLICY telegram_pairing_tokens_insert_own");
    expect(sql).toContain("CREATE POLICY telegram_pairing_tokens_delete_own");
  });

  it("adds the global ownership constraint for external channel conversations", () => {
    const sql = readMigrationSql(ownershipGuardMigrationPath);

    expect(sql).toContain("ALTER TABLE public.conversation_channel_mappings");
    expect(sql).toContain("UNIQUE (channel, external_conversation_id)");
  });

  it("creates telegram_pending_questions for sequential Telegram question batches", () => {
    const sql = readMigrationSql(pendingQuestionsMigrationPath);

    expect(sql).toContain("CREATE TABLE public.telegram_pending_questions");
    expect(sql).toContain("chat_id text NOT NULL UNIQUE");
    expect(sql).toContain("questions jsonb NOT NULL DEFAULT '[]'");
    expect(sql).toContain("answers jsonb NOT NULL DEFAULT '[]'");
    expect(sql).toContain("current_index integer NOT NULL DEFAULT 0");
    expect(sql).toContain("awaiting_text_reply boolean NOT NULL DEFAULT false");
    expect(sql).toContain("ALTER TABLE public.telegram_pending_questions ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("CREATE POLICY telegram_pending_questions_select_own");
    expect(sql).toContain("CREATE POLICY telegram_pending_questions_insert_own");
    expect(sql).toContain("CREATE POLICY telegram_pending_questions_update_own");
    expect(sql).toContain("CREATE POLICY telegram_pending_questions_delete_own");
  });
});
