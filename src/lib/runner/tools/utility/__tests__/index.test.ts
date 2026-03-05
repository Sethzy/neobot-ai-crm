/**
 * Tests for utility tool barrel.
 * @module lib/runner/tools/utility/__tests__/index
 */
import { describe, expect, it } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { createUtilityTools } from "../index";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const THREAD_ID = "660e8400-e29b-41d4-a716-446655440000";

describe("createUtilityTools", () => {
  it("returns all utility tools", () => {
    const supabase = createMockSupabaseClient();
    const tools = createUtilityTools(supabase as never, CLIENT_ID, THREAD_ID);

    expect(Object.keys(tools).sort()).toEqual([
      "get_agent_db_schema",
      "list_todo",
      "manage_todo",
      "rename_chat",
      "run_agent_memory_sql",
      "send_message",
    ]);
  });

  it("ensures each tool has an execute function", () => {
    const supabase = createMockSupabaseClient();
    const tools = createUtilityTools(supabase as never, CLIENT_ID, THREAD_ID);

    for (const [toolName, toolDefinition] of Object.entries(tools)) {
      expect(toolDefinition, `${toolName} should have execute`).toHaveProperty("execute");
    }
  });
});
