/**
 * Tests for the trigger tool barrel.
 * @module lib/runner/tools/triggers/__tests__/index
 */
import { describe, expect, it } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { createTriggerTools } from "../index";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const THREAD_ID = "660e8400-e29b-41d4-a716-446655440000";

describe("createTriggerTools", () => {
  it("returns search, setup, and manage tools when mutations are allowed", () => {
    const supabase = createMockSupabaseClient();
    const tools = createTriggerTools(supabase as never, CLIENT_ID, THREAD_ID, {
      allowMutations: true,
    });

    expect(Object.keys(tools).sort()).toEqual([
      "manage_active_triggers",
      "search_triggers",
      "setup_trigger",
    ]);
  });

  it("returns read-only trigger tools when mutations are disabled", () => {
    const supabase = createMockSupabaseClient();
    const tools = createTriggerTools(supabase as never, CLIENT_ID, THREAD_ID, {
      allowMutations: false,
    });

    expect(Object.keys(tools).sort()).toEqual([
      "manage_active_triggers",
      "search_triggers",
    ]);
  });
});
