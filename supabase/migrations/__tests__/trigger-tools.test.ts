/**
 * Contract tests for the PR20 trigger-tool migrations.
 * @module supabase/migrations/__tests__/trigger-tools
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const columnsMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260306040000_add_trigger_retry_and_webhook_columns.sql",
);
const reminderMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260306040001_add_active_trigger_count_to_system_reminder.sql",
);
const retryMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260306040002_update_release_trigger_claim_for_retry.sql",
);
const realtimeMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260306040003_enable_realtime_for_agent_triggers.sql",
);

describe("PR20 trigger-tool migrations", () => {
  it("adds retry_count, webhook_secret, and invocation_message columns", () => {
    const migrationSql = readFileSync(columnsMigrationPath, "utf8");

    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0");
    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS webhook_secret TEXT");
    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS invocation_message TEXT");
    expect(migrationSql).toContain("agent_triggers_invocation_message_length");
    expect(migrationSql).toContain("length(invocation_message) <= 200");
  });

  it("patches get_system_reminder_context with active_trigger_count without changing the auth guard", () => {
    const migrationSql = readFileSync(reminderMigrationPath, "utf8");

    expect(migrationSql).toContain("'active_trigger_count'");
    expect(migrationSql).toContain("FROM public.agent_triggers AS tr");
    expect(migrationSql).toContain("tr.enabled = true");
    expect(migrationSql).toContain("tr.trigger_type != 'pulse'");
    expect(migrationSql).toContain("WHERE c.client_id = p_client_id");
    expect(migrationSql).toContain("AND (\n      auth.role() = 'service_role'");
    expect(migrationSql).toContain("OR p_client_id = public.get_my_client_id()");
  });

  it("extends release_trigger_claim for retry-aware next_fire_at advancement", () => {
    const migrationSql = readFileSync(retryMigrationPath, "utf8");

    expect(migrationSql).toContain("p_advance_next_fire_at BOOLEAN DEFAULT true");
    expect(migrationSql).toContain("WHEN p_advance_next_fire_at AND p_next_fire_at IS NOT NULL THEN p_next_fire_at");
    expect(migrationSql).toContain("WHEN p_status = 'completed' THEN 0");
    expect(migrationSql).toContain("WHEN p_status = 'failed_permanent' THEN 0");
    expect(migrationSql).toContain(
      "WHEN p_advance_next_fire_at AND p_status IN ('failed', 'dispatch_failed') THEN 0",
    );
    expect(migrationSql).toContain("WHEN p_status IN ('failed', 'dispatch_failed') THEN retry_count + 1");
    expect(migrationSql).toContain("WHEN p_status = 'failed_permanent' THEN false");
  });

  it("adds agent_triggers to the Supabase Realtime publication", () => {
    const migrationSql = readFileSync(realtimeMigrationPath, "utf8");

    expect(migrationSql).toContain("tablename = 'agent_triggers'");
    expect(migrationSql).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_triggers");
  });
});
