import { describe, expect, it } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { runSqlTool } from "../run-sql";

function makeContext(client: ReturnType<typeof createMockSupabaseClient>): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: client as any,
    clientId: "client-1",
    threadId: "thread-1",
    isChatContext: true,
  };
}

describe("runSqlTool", () => {
  it("sets chatOnly and returns rows from the readonly RPC", async () => {
    const client = createMockSupabaseClient({
      rpcResults: { run_readonly_sql: { data: [{ id: 1 }], error: null } },
    });

    const result = await runSqlTool.execute(
      { query: "select 1" },
      makeContext(client),
    );

    expect(runSqlTool.chatOnly).toBe(true);
    expect(result).toEqual({ success: true, rows: [{ id: 1 }], row_count: 1 });
    expect(client.calls.rpc).toEqual([
      { fn: "run_readonly_sql", args: { query_text: "select 1" } },
    ]);
  });

  it("caps large SQL result sets before returning them to the model", async () => {
    const rows = Array.from({ length: 250 }, (_, index) => ({ id: index + 1 }));
    const client = createMockSupabaseClient({
      rpcResults: { run_readonly_sql: { data: rows, error: null } },
    });

    const result = await runSqlTool.execute(
      { query: "select * from contacts" },
      makeContext(client),
    );

    expect(result).toEqual({
      success: true,
      rows: rows.slice(0, 200),
      row_count: 200,
      truncated: true,
      truncated_from: 250,
    });
  });
});
