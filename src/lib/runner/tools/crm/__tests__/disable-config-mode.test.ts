/**
 * Tests for the disable_crm_config_mode tool.
 * @module lib/runner/tools/crm/__tests__/disable-config-mode.test
 */
import { describe, expect, it } from "vitest";

import { createDisableConfigModeTool } from "../disable-config-mode";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

describe("createDisableConfigModeTool", () => {
  it("returns a tool object with disable_crm_config_mode key", () => {
    const { client } = createMockSupabase();
    const tools = createDisableConfigModeTool(client, CLIENT_ID);

    expect(tools).toHaveProperty("disable_crm_config_mode");
    expect(typeof tools.disable_crm_config_mode.execute).toBe("function");
  });

  it("sets crm_config_mode_until to null on execute", async () => {
    const { client, builderHistory } = createMockSupabase({
      clients: { data: null, error: null },
    });
    const tools = createDisableConfigModeTool(client, CLIENT_ID);

    const result = await tools.disable_crm_config_mode.execute({});

    expect(result).toEqual({
      success: true,
      message: "CRM configuration mode has been disabled. The configure_crm tool will no longer be available.",
    });

    // Verify the correct Supabase chain was called
    const clientsBuilder = builderHistory.clients?.[0];
    expect(clientsBuilder).toBeDefined();
    expect(clientsBuilder!.update).toHaveBeenCalledWith({ crm_config_mode_until: null });
    expect(clientsBuilder!.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });

  it("returns error on DB failure", async () => {
    const { client } = createMockSupabase({
      clients: { data: null, error: { message: "Connection refused" } },
    });
    const tools = createDisableConfigModeTool(client, CLIENT_ID);

    const result = await tools.disable_crm_config_mode.execute({});

    expect(result).toEqual({
      success: false,
      error: "Connection refused",
    });
  });
});
