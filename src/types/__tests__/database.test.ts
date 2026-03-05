/**
 * Type contracts for generated Supabase database bindings.
 * @module types/__tests__/database
 */
import { describe, expectTypeOf, it } from "vitest";

import type { Database } from "@/types/database";

describe("Database autopilot bindings", () => {
  it("exposes autopilot_config table types", () => {
    type AutopilotConfigRow = Database["public"]["Tables"]["autopilot_config"]["Row"];
    type AutopilotConfigInsert = Database["public"]["Tables"]["autopilot_config"]["Insert"];
    type AutopilotConfigUpdate = Database["public"]["Tables"]["autopilot_config"]["Update"];

    expectTypeOf<AutopilotConfigRow>().toMatchTypeOf<{
      client_id: string;
      config_id: string;
      created_at: string;
      enabled: boolean;
      pulse_interval: string;
      quiet_hours_end: string | null;
      quiet_hours_start: string | null;
      updated_at: string;
    }>();

    expectTypeOf<AutopilotConfigInsert>().toMatchTypeOf<{
      client_id: string;
      enabled?: boolean;
      pulse_interval?: string;
      quiet_hours_end?: string | null;
      quiet_hours_start?: string | null;
    }>();

    expectTypeOf<AutopilotConfigUpdate>().toMatchTypeOf<{
      enabled?: boolean;
      pulse_interval?: string;
      quiet_hours_end?: string | null;
      quiet_hours_start?: string | null;
    }>();
  });
});
