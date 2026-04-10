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

  it("returns all 13 expected CRM tools when writes are enabled", () => {
    const { client } = createMockSupabase();

    const tools = createCrmTools(client, CLIENT_ID, { allowWriteTools: true });

    expect(Object.keys(tools).sort()).toEqual([
      "attach_file_to_record",
      "configure_crm",
      "create_interaction",
      "create_record",
      "create_task",
      "delete_record_attachment",
      "delete_records",
      "link_records",
      "list_record_attachments",
      "manage_views",
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
    expect(toolNames).not.toContain("delete_record_attachment");
    expect(toolNames).not.toContain("configure_crm");
    expect(toolNames).toContain("attach_file_to_record");
    expect(toolNames).toContain("list_record_attachments");
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

  it("always includes configure_crm for normal chat runs", () => {
    const { client } = createMockSupabase();

    const tools = createCrmTools(client, CLIENT_ID);

    const toolNames = Object.keys(tools).sort();
    expect(toolNames).toContain("configure_crm");
    expect(toolNames).toContain("search_crm");
    expect(toolNames).toContain("create_record");
    expect(toolNames).toContain("update_record");
  });
});
