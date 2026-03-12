/**
 * Tests for the crm_sql tool.
 * @module lib/runner/tools/crm/__tests__/crm-sql.test
 */
import { describe, expect, it, vi } from "vitest";

import { createCrmSqlTool } from "../crm-sql";
import { createMockSupabase } from "./mock-supabase";

const EXEC_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

/** Helper to create a mock client with `.rpc()` support. */
function createRpcMockClient(rpcResult: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  const client = { rpc, from: vi.fn() } as never;
  return { client, rpc };
}

describe("crm_sql", () => {
  it("executes a valid SELECT query", async () => {
    const rows = [{ contact_id: "c1", first_name: "John" }];
    const { client } = createRpcMockClient({ data: rows, error: null });
    const tools = createCrmSqlTool(client);

    const result = await tools.crm_sql.execute(
      { query: "SELECT * FROM contacts LIMIT 10", purpose: "List contacts" },
      EXEC_OPTIONS,
    );

    expect(result).toEqual({ success: true, rows, row_count: 1 });
  });

  it("executes a CTE (WITH) query", async () => {
    const rows = [{ count: 5 }];
    const { client, rpc } = createRpcMockClient({ data: rows, error: null });
    const tools = createCrmSqlTool(client);

    const result = await tools.crm_sql.execute(
      {
        query: "WITH active AS (SELECT * FROM deals WHERE stage = 'offer') SELECT COUNT(*) FROM active",
        purpose: "Count active deals",
      },
      EXEC_OPTIONS,
    );

    expect(result).toEqual({ success: true, rows, row_count: 1 });
    expect(rpc).toHaveBeenCalledWith("run_readonly_sql", {
      query_text: "WITH active AS (SELECT * FROM deals WHERE stage = 'offer') SELECT COUNT(*) FROM active",
    });
  });

  it("rejects queries with semicolons", async () => {
    const { client } = createRpcMockClient({ data: null, error: null });
    const tools = createCrmSqlTool(client);

    const result = await tools.crm_sql.execute(
      { query: "SELECT 1; DROP TABLE contacts", purpose: "test" },
      EXEC_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "Only single-statement SQL is allowed" });
  });

  it("rejects non-SELECT queries", async () => {
    const { client } = createRpcMockClient({ data: null, error: null });
    const tools = createCrmSqlTool(client);

    const result = await tools.crm_sql.execute(
      { query: "DELETE FROM contacts", purpose: "test" },
      EXEC_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "Only SELECT/CTE queries are allowed" });
  });

  it("rejects INSERT queries", async () => {
    const { client } = createRpcMockClient({ data: null, error: null });
    const tools = createCrmSqlTool(client);

    const result = await tools.crm_sql.execute(
      { query: "INSERT INTO contacts (first_name) VALUES ('x')", purpose: "test" },
      EXEC_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "Only SELECT/CTE queries are allowed" });
  });

  it("rejects empty queries", async () => {
    const { client } = createRpcMockClient({ data: null, error: null });
    const tools = createCrmSqlTool(client);

    const result = await tools.crm_sql.execute(
      { query: "   ", purpose: "test" },
      EXEC_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "Query cannot be empty" });
  });

  it("returns database error on RPC failure", async () => {
    const { client } = createRpcMockClient({
      data: null,
      error: { message: "relation does not exist" },
    });
    const tools = createCrmSqlTool(client);

    const result = await tools.crm_sql.execute(
      { query: "SELECT * FROM nonexistent", purpose: "test" },
      EXEC_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "relation does not exist" });
  });

  it("returns empty rows array when no data", async () => {
    const { client } = createRpcMockClient({ data: null, error: null });
    const tools = createCrmSqlTool(client);

    const result = await tools.crm_sql.execute(
      { query: "SELECT * FROM contacts WHERE 1=0", purpose: "test empty" },
      EXEC_OPTIONS,
    );

    expect(result).toEqual({ success: true, rows: [], row_count: 0 });
  });

  describe("schema validation", () => {
    it("requires query field", () => {
      const { client } = createRpcMockClient({ data: null, error: null });
      const tools = createCrmSqlTool(client);
      const parsed = tools.crm_sql.inputSchema.safeParse({ purpose: "test" });
      expect(parsed.success).toBe(false);
    });

    it("requires purpose field", () => {
      const { client } = createRpcMockClient({ data: null, error: null });
      const tools = createCrmSqlTool(client);
      const parsed = tools.crm_sql.inputSchema.safeParse({ query: "SELECT 1" });
      expect(parsed.success).toBe(false);
    });

    it("accepts valid input", () => {
      const { client } = createRpcMockClient({ data: null, error: null });
      const tools = createCrmSqlTool(client);
      const parsed = tools.crm_sql.inputSchema.safeParse({
        query: "SELECT 1",
        purpose: "test",
      });
      expect(parsed.success).toBe(true);
    });
  });
});
