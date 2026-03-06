/**
 * Contract tests for the PR19 autopilot pulse migrations.
 * @module supabase/migrations/__tests__/autopilot-pulse
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const autopilotConfigMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260306030000_create_autopilot_config.sql",
);
const pulseTriggerMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260306030001_add_pulse_trigger_type.sql",
);
const bootstrapMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260306030002_bootstrap_autopilot_on_signup.sql",
);
const verificationPath = join(
  process.cwd(),
  "supabase/verification/pr19_autopilot_bootstrap_check.sql",
);

const autopilotConfigSql = readFileSync(autopilotConfigMigrationPath, "utf8");
const pulseTriggerSql = readFileSync(pulseTriggerMigrationPath, "utf8");
const bootstrapSql = readFileSync(bootstrapMigrationPath, "utf8");
const verificationSql = readFileSync(verificationPath, "utf8");

describe("PR19 autopilot pulse migrations", () => {
  it("creates a single-row-per-client autopilot_config table with quiet-hours invariants", () => {
    expect(autopilotConfigSql).toContain("CREATE TABLE public.autopilot_config");
    expect(autopilotConfigSql).toContain("client_id UUID NOT NULL UNIQUE");
    expect(autopilotConfigSql).toContain("pulse_interval TEXT NOT NULL DEFAULT '6h'");
    expect(autopilotConfigSql).toContain("CHECK (pulse_interval IN ('1h', '2h', '6h', '12h'))");
    expect(autopilotConfigSql).toContain("quiet_hours_start TIME");
    expect(autopilotConfigSql).toContain("quiet_hours_end TIME");
    expect(autopilotConfigSql).toContain("autopilot_config_quiet_hours_check");
    expect(autopilotConfigSql).toContain("ALTER TABLE public.autopilot_config ENABLE ROW LEVEL SECURITY;");
    expect(autopilotConfigSql).toContain("CREATE POLICY autopilot_config_select_own");
    expect(autopilotConfigSql).toContain("CREATE POLICY autopilot_config_update_own");
  });

  it("extends agent_triggers to support pulse with the same scheduling invariant as schedule", () => {
    expect(pulseTriggerSql).toContain("CHECK (trigger_type IN ('schedule', 'webhook', 'rss', 'pulse'))");
    expect(pulseTriggerSql).toContain("agent_triggers_schedule_fields_check");
    expect(pulseTriggerSql).toContain("trigger_type NOT IN ('schedule', 'pulse')");
    expect(pulseTriggerSql).toContain("cron_expression IS NOT NULL AND next_fire_at IS NOT NULL");
    expect(pulseTriggerSql).toContain("CREATE UNIQUE INDEX idx_agent_triggers_one_pulse_per_client");
  });

  it("bootstraps the autopilot thread, pulse trigger, and config with authoritative config syncing", () => {
    expect(bootstrapSql).toContain("CREATE OR REPLACE FUNCTION public.autopilot_interval_to_cron");
    expect(bootstrapSql).toContain("CREATE OR REPLACE FUNCTION public.autopilot_next_fire_at");
    expect(bootstrapSql).toContain("date_bin(");
    expect(bootstrapSql).toContain("Sunder Autopilot");
    expect(bootstrapSql).toContain("Autopilot Pulse");
    expect(bootstrapSql).toContain("INSERT INTO public.conversation_threads");
    expect(bootstrapSql).toContain("INSERT INTO public.agent_triggers");
    expect(bootstrapSql).toContain("INSERT INTO public.autopilot_config");
    expect(bootstrapSql).toContain("CREATE OR REPLACE FUNCTION public.sync_autopilot_trigger_from_config()");
    expect(bootstrapSql).toContain("CREATE TRIGGER trg_sync_autopilot_trigger_from_config");
    expect(bootstrapSql).toContain("CREATE OR REPLACE FUNCTION public.bootstrap_autopilot()");
    expect(bootstrapSql).toContain("CREATE TRIGGER on_client_created_bootstrap_autopilot");
    expect(bootstrapSql).toContain("SELECT public.ensure_autopilot_for_client(client_id)");
  });

  it("locks down ensure_autopilot_for_client to privileged execution only", () => {
    expect(bootstrapSql).toContain("IF auth.role() <> 'service_role' THEN");
    expect(bootstrapSql).toContain("ensure_autopilot_for_client is restricted to service_role");
    expect(bootstrapSql).toContain(
      "REVOKE ALL ON FUNCTION public.ensure_autopilot_for_client(UUID)",
    );
    expect(bootstrapSql).toContain(
      "GRANT EXECUTE ON FUNCTION public.ensure_autopilot_for_client(UUID) TO service_role;",
    );
  });

  it("adds a verification script that checks bootstrap coverage and pulse invariants", () => {
    expect(verificationSql).toContain("public.autopilot_config");
    expect(verificationSql).toContain("trigger_type = 'pulse'");
    expect(verificationSql).toContain("Sunder Autopilot");
    expect(verificationSql).toContain("idx_agent_triggers_one_pulse_per_client");
    expect(verificationSql).toContain("autopilot_config");
  });
});
