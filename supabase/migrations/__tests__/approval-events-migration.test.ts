/**
 * Contract tests for the PR34 approval event migrations.
 * @module supabase/migrations/__tests__/approval-events-migration
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const approvalEventsMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260310000000_create_approval_events.sql",
);
const systemReminderMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260310000001_add_pending_approvals_to_system_reminder.sql",
);

function readMigrationSql(path: string) {
  expect(existsSync(path)).toBe(true);
  return readFileSync(path, "utf8");
}

describe("PR34 approval event migrations", () => {
  it("creates approval_events with the expected lifecycle columns and indexes", () => {
    const migrationSql = readMigrationSql(approvalEventsMigrationPath);

    expect(migrationSql).toContain("CREATE TABLE public.approval_events");
    expect(migrationSql).toContain("client_id     uuid NOT NULL REFERENCES public.clients(client_id)");
    expect(migrationSql).toContain("thread_id     uuid NOT NULL REFERENCES public.conversation_threads(thread_id)");
    expect(migrationSql).toContain("run_id        uuid REFERENCES public.runs(run_id)");
    expect(migrationSql).toContain("tool_name     text NOT NULL");
    expect(migrationSql).toContain("tool_input    jsonb NOT NULL DEFAULT '{}'");
    expect(migrationSql).toContain("CHECK (status IN ('pending', 'approved', 'denied', 'expired'))");
    expect(migrationSql).toContain("CONSTRAINT uq_approval_events_approval_id UNIQUE (client_id, approval_id)");
    expect(migrationSql).toContain("CREATE INDEX idx_approval_events_pending");
    expect(migrationSql).toContain("CREATE INDEX idx_approval_events_approval_id");
  });

  it("uses the project RLS pattern for select, insert, and update", () => {
    const migrationSql = readMigrationSql(approvalEventsMigrationPath);

    expect(migrationSql).toContain("ALTER TABLE public.approval_events ENABLE ROW LEVEL SECURITY");
    expect(migrationSql).toContain("CREATE POLICY \"approval_events_select\"");
    expect(migrationSql).toContain("USING (client_id = public.get_my_client_id())");
    expect(migrationSql).toContain("CREATE POLICY \"approval_events_insert\"");
    expect(migrationSql).toContain("auth.role() = 'service_role'");
    expect(migrationSql).toContain("OR client_id = public.get_my_client_id()");
    expect(migrationSql).toContain("CREATE POLICY \"approval_events_update\"");
    expect(migrationSql).toContain("WITH CHECK (client_id = public.get_my_client_id())");
  });

  it("patches get_system_reminder_context with pending_approval_count without changing the auth guard", () => {
    const migrationSql = readMigrationSql(systemReminderMigrationPath);

    expect(migrationSql).toContain("'pending_approval_count'");
    expect(migrationSql).toContain("'active_connection_toolkits'");
    expect(migrationSql).toContain("FROM public.approval_events AS ae");
    expect(migrationSql).toContain("ae.status = 'pending'");
    expect(migrationSql).toContain("WHERE c.client_id = p_client_id");
    expect(migrationSql).toContain("auth.role() = 'service_role'");
    expect(migrationSql).toContain("OR p_client_id = public.get_my_client_id()");
  });
});
