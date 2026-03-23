/**
 * Contract tests for the sprite_sessions migration.
 * @module supabase/migrations/__tests__/sprite-sessions-migration
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260324090000_create_sprite_sessions.sql",
);

function readMigrationSql() {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("sprite_sessions migration", () => {
  it("creates the sprite_sessions table with the expected tracking columns", () => {
    const migrationSql = readMigrationSql();

    expect(migrationSql).toContain("CREATE TABLE public.sprite_sessions");
    expect(migrationSql).toContain("client_id uuid NOT NULL REFERENCES public.clients(client_id)");
    expect(migrationSql).toContain(
      "thread_id uuid NOT NULL REFERENCES public.conversation_threads(thread_id)",
    );
    expect(migrationSql).toContain("sprite_name text NOT NULL");
    expect(migrationSql).toContain("status text NOT NULL DEFAULT 'running'");
    expect(migrationSql).toContain("preview_url text");
    expect(migrationSql).toContain("last_active_at timestamptz NOT NULL DEFAULT now()");
    expect(migrationSql).toContain("destroyed_at timestamptz");
  });

  it("enforces one sprite per thread and keeps a non-destroyed thread lookup index", () => {
    const migrationSql = readMigrationSql();

    expect(migrationSql).toContain("UNIQUE (thread_id)");
    expect(migrationSql).toContain("CREATE INDEX idx_sprite_sessions_thread");
    expect(migrationSql).toContain("WHERE status != 'destroyed'");
  });

  it("enables RLS with per-client policies", () => {
    const migrationSql = readMigrationSql();

    expect(migrationSql).toContain("ALTER TABLE public.sprite_sessions ENABLE ROW LEVEL SECURITY");
    expect(migrationSql).toContain("CREATE POLICY sprite_sessions_select_own");
    expect(migrationSql).toContain("CREATE POLICY sprite_sessions_insert_own");
    expect(migrationSql).toContain("CREATE POLICY sprite_sessions_update_own");
    expect(migrationSql).toContain("CREATE POLICY sprite_sessions_delete_own");
    expect(migrationSql).toContain("public.get_my_client_id()");
  });
});
