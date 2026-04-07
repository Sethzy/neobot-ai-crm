/**
 * Tests for the connection tool barrel.
 * @module lib/runner/tools/connections/__tests__/index
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/client", () => ({
  getComposio: vi.fn(),
}));

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { createConnectionTools } from "../index";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const THREAD_ID = "thread-001";

describe("createConnectionTools", () => {
  it("returns the four read-only tools when mutations are disabled", () => {
    const supabase = createMockSupabaseClient();
    const tools = createConnectionTools(supabase as never, CLIENT_ID, THREAD_ID, {
      allowMutations: false,
    });

    expect(Object.keys(tools).sort()).toEqual([
      "get_details_for_connections",
      "get_integrations_capabilities",
      "list_users_connections",
      "search_for_integrations",
    ]);
  });

  it("returns all eight tools when mutations are enabled", () => {
    const supabase = createMockSupabaseClient();
    const tools = createConnectionTools(supabase as never, CLIENT_ID, THREAD_ID, {
      allowMutations: true,
    });

    expect(Object.keys(tools).sort()).toEqual([
      "create_new_connections",
      "delete_connection",
      "get_details_for_connections",
      "get_integrations_capabilities",
      "list_users_connections",
      "manage_activated_tools_for_connections",
      "reauthorize_connection",
      "search_for_integrations",
    ]);
  });

  it("marks manage_activated_tools_for_connections as approval-gated", () => {
    const supabase = createMockSupabaseClient();
    const tools = createConnectionTools(supabase as never, CLIENT_ID, THREAD_ID, {
      allowMutations: true,
    });

    expect(
      (tools.manage_activated_tools_for_connections as { needsApproval?: unknown }).needsApproval,
    ).toBe(true);
  });
});
