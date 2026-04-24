/**
 * Type contracts for generated Supabase database bindings.
 * @module types/__tests__/database
 */
import { describe, expectTypeOf, it } from "vitest";

import type { Database } from "@/types/database";

describe("Database Daily Orchestrator bindings", () => {
  it("tracks the one-time Daily Orchestrator seed marker on clients", () => {
    type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
    type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"];
    type ClientUpdate = Database["public"]["Tables"]["clients"]["Update"];

    expectTypeOf<ClientRow>().toMatchTypeOf<{
      client_id: string;
      daily_orchestrator_seeded_at: string | null;
    }>();

    expectTypeOf<ClientInsert>().toMatchTypeOf<{
      daily_orchestrator_seeded_at?: string | null;
    }>();

    expectTypeOf<ClientUpdate>().toMatchTypeOf<{
      daily_orchestrator_seeded_at?: string | null;
    }>();
  });

  it("exposes the main-thread bootstrap RPC and no autopilot config table", () => {
    type EnsureMainThreadArgs =
      Database["public"]["Functions"]["ensure_main_thread_for_client"]["Args"];
    type EnsureMainThreadReturns =
      Database["public"]["Functions"]["ensure_main_thread_for_client"]["Returns"];
    type SeedDailyOrchestratorArgs =
      Database["public"]["Functions"]["seed_default_daily_orchestrator"]["Args"];
    type SeedDailyOrchestratorReturns =
      Database["public"]["Functions"]["seed_default_daily_orchestrator"]["Returns"];

    expectTypeOf<EnsureMainThreadArgs>().toMatchTypeOf<{
      p_client_id: string;
    }>();
    expectTypeOf<EnsureMainThreadReturns>().toEqualTypeOf<string>();
    expectTypeOf<SeedDailyOrchestratorArgs>().toMatchTypeOf<{
      p_client_id: string;
      p_thread_id: string;
      p_name: string;
      p_instruction_path: string;
      p_invocation_message: string;
      p_cron_expression: string;
      p_payload: Database["public"]["Tables"]["agent_triggers"]["Row"]["payload"];
      p_next_fire_at: string;
    }>();
    expectTypeOf<SeedDailyOrchestratorReturns>().toMatchTypeOf<{
      seeded: boolean;
      trigger_id: string | null;
    }[]>();
  });
});
