import { describe, expect, it } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { getAgentDbSchemaTool } from "../get-agent-db-schema";

function makeContext(client: ReturnType<typeof createMockSupabaseClient>): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: client as any,
    clientId: "client-1",
    threadId: "thread-1",
    isChatContext: true,
  };
}

describe("getAgentDbSchemaTool", () => {
  it("sets chatOnly and returns the client-accessible schema", async () => {
    const client = createMockSupabaseClient({
      rpcResults: { get_client_accessible_schema: { data: [{ table: "contacts" }], error: null } },
    });

    const result = await getAgentDbSchemaTool.execute({}, makeContext(client));

    expect(getAgentDbSchemaTool.chatOnly).toBe(true);
    expect(result).toEqual({ success: true, schema: [{ table: "contacts" }] });
    expect(client.calls.rpc).toEqual([
      { fn: "get_client_accessible_schema", args: undefined },
    ]);
  });
});
