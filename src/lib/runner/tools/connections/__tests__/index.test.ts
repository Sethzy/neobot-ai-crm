/**
 * Tests for the connection tool barrel.
 * @module lib/runner/tools/connections/__tests__/index
 */
import { describe, expect, it } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { createConnectionTools } from "../index";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("createConnectionTools", () => {
  it("returns the four read-only tools when mutations are disabled", () => {
    const supabase = createMockSupabaseClient();
    const tools = createConnectionTools(supabase as never, CLIENT_ID, {
      allowMutations: false,
    });

    expect(Object.keys(tools).sort()).toEqual([
      "get_details_for_connections",
      "get_integrations_capabilities",
      "list_users_connections",
      "search_for_integrations",
    ]);
  });

  it("returns the same tool set when mutations are enabled before PR26d", () => {
    const supabase = createMockSupabaseClient();
    const tools = createConnectionTools(supabase as never, CLIENT_ID, {
      allowMutations: true,
    });

    expect(Object.keys(tools).sort()).toEqual([
      "get_details_for_connections",
      "get_integrations_capabilities",
      "list_users_connections",
      "search_for_integrations",
    ]);
  });
});
