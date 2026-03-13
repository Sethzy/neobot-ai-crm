/**
 * Tests for the disable_crm_config_mode tool.
 * @module lib/runner/tools/crm/__tests__/disable-config-mode.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateAdminClient } = vi.hoisted(() => ({
  mockCreateAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: mockCreateAdminClient,
}));

import { createDisableConfigModeTool } from "../disable-config-mode";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

function createMockAdminClient(updateResult: { error: null | { message: string } }) {
  const mockEq = vi.fn().mockResolvedValue(updateResult);
  const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
  const client = { from: vi.fn().mockReturnValue({ update: mockUpdate }) };
  return { client, mockUpdate, mockEq };
}

describe("createDisableConfigModeTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a tool object with disable_crm_config_mode key", () => {
    const tools = createDisableConfigModeTool(CLIENT_ID);

    expect(tools).toHaveProperty("disable_crm_config_mode");
    expect(typeof tools.disable_crm_config_mode.execute).toBe("function");
  });

  it("sets crm_config_mode_until to null via admin client", async () => {
    const { client, mockUpdate, mockEq } = createMockAdminClient({ error: null });
    mockCreateAdminClient.mockResolvedValue(client);

    const tools = createDisableConfigModeTool(CLIENT_ID);
    const result = await tools.disable_crm_config_mode.execute({});

    expect(result).toEqual({
      success: true,
      message: "CRM configuration mode has been disabled. The configure_crm tool will no longer be available.",
    });

    expect(mockCreateAdminClient).toHaveBeenCalled();
    expect(client.from).toHaveBeenCalledWith("clients");
    expect(mockUpdate).toHaveBeenCalledWith({ crm_config_mode_until: null });
    expect(mockEq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });

  it("returns error on DB failure", async () => {
    const { client } = createMockAdminClient({ error: { message: "Connection refused" } });
    mockCreateAdminClient.mockResolvedValue(client);

    const tools = createDisableConfigModeTool(CLIENT_ID);
    const result = await tools.disable_crm_config_mode.execute({});

    expect(result).toEqual({
      success: false,
      error: "Connection refused",
    });
  });
});
