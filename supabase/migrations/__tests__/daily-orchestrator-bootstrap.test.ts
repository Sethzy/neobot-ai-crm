/**
 * Contract tests for the Daily Orchestrator bootstrap migration.
 * @module supabase/migrations/__tests__/daily-orchestrator-bootstrap
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260424180000_replace_autopilot_with_daily_orchestrator.sql",
);
const migrationSql = readFileSync(migrationPath, "utf8");

describe("Daily Orchestrator bootstrap migration", () => {
  it("drops autopilot-only tables, functions, and triggers", () => {
    expect(migrationSql).toContain("DROP TABLE IF EXISTS public.autopilot_config CASCADE");
    expect(migrationSql).toContain("DROP FUNCTION IF EXISTS public.ensure_autopilot_for_client(UUID) CASCADE");
    expect(migrationSql).toContain("DROP FUNCTION IF EXISTS public.autopilot_interval_to_cron(TEXT) CASCADE");
    expect(migrationSql).toContain("DROP TRIGGER IF EXISTS on_client_created_bootstrap_autopilot ON public.clients");
  });

  it("adds the one-time Daily Orchestrator seed marker", () => {
    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS daily_orchestrator_seeded_at TIMESTAMPTZ");
  });

  it("keeps only schedule, webhook, and rss triggers", () => {
    expect(migrationSql).toContain("DELETE FROM public.agent_triggers");
    expect(migrationSql).toContain("WHERE trigger_type = 'pulse'");
    expect(migrationSql).toContain("CHECK (trigger_type IN ('schedule', 'webhook', 'rss'))");
  });

  it("keeps only chat, webhook, and cron run types", () => {
    expect(migrationSql).toContain("UPDATE public.runs");
    expect(migrationSql).toContain("WHERE run_type = 'autopilot'");
    expect(migrationSql).toContain("CHECK (run_type IN ('chat', 'webhook', 'cron'))");
  });

  it("replaces autopilot bootstrap with a main-thread-only bootstrap", () => {
    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.ensure_main_thread_for_client");
    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.bootstrap_main_thread()");
    expect(migrationSql).toContain("title = 'Main'");
    expect(migrationSql).toContain("is_primary = true");
    expect(migrationSql).toContain("SELECT public.ensure_main_thread_for_client(client_id)");
  });
});
