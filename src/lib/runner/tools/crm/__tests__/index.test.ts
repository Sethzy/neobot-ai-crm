/**
 * Tests for CRM tool barrel aggregation.
 * @module lib/runner/tools/crm/__tests__/index.test
 */
import { describe, expect, it, vi } from "vitest";

import { createCrmTools } from "../index";
import { createMockSupabase } from "./mock-supabase";

vi.mock("@/lib/analytics/posthog-server", () => ({
  captureServerEvent: vi.fn(),
  captureServerEvents: vi.fn(),
}));

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

describe("createCrmTools", () => {
  it("returns only read tools when writes are disabled", () => {
    const { client } = createMockSupabase();

    const tools = createCrmTools(client, CLIENT_ID, { allowWriteTools: false });

    expect(Object.keys(tools).sort()).toEqual([
      "search_crm",
    ]);
  });

  it("returns all 8 expected CRM tools when writes are enabled", () => {
    const { client } = createMockSupabase();

    const tools = createCrmTools(client, CLIENT_ID, { allowWriteTools: true });

    expect(Object.keys(tools).sort()).toEqual([
      "create_interaction",
      "create_record",
      "create_task",
      "delete_records",
      "link_records",
      "search_crm",
      "update_record",
      "update_task",
    ]);
  });

  it("excludes delete tools when allowDeleteTools is false", () => {
    const { client } = createMockSupabase();

    const tools = createCrmTools(client, CLIENT_ID, {
      allowWriteTools: true,
      allowDeleteTools: false,
    });

    const toolNames = Object.keys(tools).sort();

    expect(toolNames).not.toContain("delete_records");
    expect(toolNames).toContain("create_record");
    expect(toolNames).toContain("update_record");
  });

  it("returns tool objects with execute functions", () => {
    const { client } = createMockSupabase();

    const tools = createCrmTools(client, CLIENT_ID);

    for (const toolName of Object.keys(tools)) {
      expect(typeof tools[toolName as keyof typeof tools]).toBe("object");
      expect(typeof tools[toolName as keyof typeof tools].execute).toBe("function");
    }
  });

  it("returns only configure_crm in setup mode", () => {
    const { client } = createMockSupabase();

    const tools = createCrmTools(client, CLIENT_ID, { mode: "setup" });

    expect(Object.keys(tools)).toEqual(["configure_crm"]);
  });

  it("includes configure_crm and disable_crm_config_mode when includeConfigTool is true", () => {
    const { client } = createMockSupabase();

    const tools = createCrmTools(client, CLIENT_ID, { includeConfigTool: true });

    const toolNames = Object.keys(tools).sort();
    expect(toolNames).toContain("configure_crm");
    expect(toolNames).toContain("disable_crm_config_mode");
    // Normal tools are still present
    expect(toolNames).toContain("search_crm");
    expect(toolNames).toContain("create_record");
    expect(toolNames).toContain("update_record");
  });

  it("does NOT include configure_crm without includeConfigTool", () => {
    const { client } = createMockSupabase();

    const tools = createCrmTools(client, CLIENT_ID);

    const toolNames = Object.keys(tools);
    expect(toolNames).not.toContain("configure_crm");
    expect(toolNames).not.toContain("disable_crm_config_mode");
  });

  it("setup mode ignores includeConfigTool — returns only configure_crm", () => {
    const { client } = createMockSupabase();

    const tools = createCrmTools(client, CLIENT_ID, {
      mode: "setup",
      includeConfigTool: true,
    });

    expect(Object.keys(tools)).toEqual(["configure_crm"]);
  });
});
