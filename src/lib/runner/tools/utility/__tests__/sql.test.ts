/**
 * Tests for SQL query tools (run_agent_memory_sql, get_agent_db_schema).
 * @module lib/runner/tools/utility/__tests__/sql
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { createSqlTools } from "../sql";
const EXECUTION_OPTIONS = {
  toolCallId: "call-1",
  messages: [],
  abortSignal: undefined,
} as never;

describe("createSqlTools", () => {
  it("returns run_agent_memory_sql and get_agent_db_schema tools", () => {
    const supabase = createMockSupabaseClient();
    const tools = createSqlTools(supabase as never);

    expect(tools).toHaveProperty("run_agent_memory_sql");
    expect(tools).toHaveProperty("get_agent_db_schema");
    expect(tools.run_agent_memory_sql).toHaveProperty("execute");
    expect(tools.get_agent_db_schema).toHaveProperty("execute");
  });
});

describe("run_agent_memory_sql", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls run_readonly_sql RPC with the query", async () => {
    const mockRows = [
      { deal_id: "d1", title: "Bishan Condo", stage: "closed_won" },
      { deal_id: "d2", title: "Tampines HDB", stage: "closed_won" },
    ];

    const supabase = createMockSupabaseClient({
      rpcResults: {
        run_readonly_sql: { data: mockRows, error: null },
      },
    });

    const tools = createSqlTools(supabase as never);
    const result = await tools.run_agent_memory_sql.execute(
      {
        query: "SELECT deal_id, title, stage FROM deals WHERE stage = 'closed_won'",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      rows: mockRows,
    });
    expect(supabase.calls.rpc).toEqual([
      {
        fn: "run_readonly_sql",
        args: {
          query_text: "SELECT deal_id, title, stage FROM deals WHERE stage = 'closed_won'",
        },
      },
    ]);
  });

  it("returns error on RPC failure", async () => {
    const supabase = createMockSupabaseClient({
      rpcResults: {
        run_readonly_sql: { data: null, error: { message: "statement timeout" } },
      },
    });

    const tools = createSqlTools(supabase as never);
    const result = await tools.run_agent_memory_sql.execute(
      { query: "SELECT * FROM massive_table" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "statement timeout",
    });
  });

  it("rejects non-read-only query shapes before RPC", async () => {
    const supabase = createMockSupabaseClient();
    const tools = createSqlTools(supabase as never);
    const result = await tools.run_agent_memory_sql.execute(
      { query: "UPDATE deals SET stage = 'closed_won'" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "Only SELECT/CTE queries are allowed",
    });
    expect(supabase.calls.rpc).toEqual([]);
  });

  it("rejects multi-statement SQL before RPC", async () => {
    const supabase = createMockSupabaseClient();
    const tools = createSqlTools(supabase as never);
    const result = await tools.run_agent_memory_sql.execute(
      { query: "SELECT * FROM deals; SELECT * FROM contacts" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "Only single-statement SQL is allowed",
    });
    expect(supabase.calls.rpc).toEqual([]);
  });
});

describe("get_agent_db_schema", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls get_client_accessible_schema RPC", async () => {
    const mockSchema = [
      {
        table: "contacts",
        row_count: 12,
        columns: [
          { name: "contact_id", type: "uuid", nullable: "NO" },
          { name: "name", type: "text", nullable: "NO" },
        ],
      },
    ];

    const supabase = createMockSupabaseClient({
      rpcResults: {
        get_client_accessible_schema: { data: mockSchema, error: null },
      },
    });

    const tools = createSqlTools(supabase as never);
    const result = await tools.get_agent_db_schema.execute({}, EXECUTION_OPTIONS);

    expect(result).toEqual({
      success: true,
      schema: mockSchema,
    });
    expect((result as { schema: Array<{ row_count: number }> }).schema[0]?.row_count).toBe(12);
    expect(supabase.calls.rpc).toEqual([
      { fn: "get_client_accessible_schema", args: undefined },
    ]);
  });

  it("returns error on RPC failure", async () => {
    const supabase = createMockSupabaseClient({
      rpcResults: {
        get_client_accessible_schema: {
          data: null,
          error: { message: "function not found" },
        },
      },
    });

    const tools = createSqlTools(supabase as never);
    const result = await tools.get_agent_db_schema.execute({}, EXECUTION_OPTIONS);

    expect(result).toEqual({
      success: false,
      error: "function not found",
    });
  });
});
