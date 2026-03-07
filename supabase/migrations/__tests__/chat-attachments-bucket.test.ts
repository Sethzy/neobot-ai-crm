/**
 * Contract tests for the public chat attachments bucket migration.
 * @module supabase/migrations/__tests__/chat-attachments-bucket
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260307113000_create_chat_attachments_bucket.sql",
);

describe("chat attachments bucket migration", () => {
  it("creates a public chat-attachments bucket idempotently", () => {
    const migrationSql = readFileSync(migrationPath, "utf8");

    expect(migrationSql).toContain("INSERT INTO storage.buckets (id, name, public)");
    expect(migrationSql).toContain("VALUES ('chat-attachments', 'chat-attachments', true)");
    expect(migrationSql).toContain("ON CONFLICT (id) DO NOTHING");
  });

  it("scopes write policies to the caller client prefix", () => {
    const migrationSql = readFileSync(migrationPath, "utf8");

    expect(migrationSql).toContain("chat_attachments_insert_own_prefix");
    expect(migrationSql).toContain("chat_attachments_update_own_prefix");
    expect(migrationSql).toContain("chat_attachments_delete_own_prefix");
    expect(migrationSql).toContain("(storage.foldername(name))[1] = public.get_my_client_id()::text");
  });
});
