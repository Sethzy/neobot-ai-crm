import { describe, expect, it } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";
import { createMockSupabase } from "@/lib/runner/tools/crm/__tests__/mock-supabase";

import { searchCrmTool } from "../search";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

function makeContext(
  client: ReturnType<typeof createMockSupabase>["client"],
): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: client as any,
    clientId: CLIENT_ID,
    threadId: "thread-1",
    isChatContext: true,
  };
}

describe("searchCrmTool", () => {
  it("exposes the expected name, description, and chatOnly flag", () => {
    expect(searchCrmTool.name).toBe("search_crm");
    expect(searchCrmTool.description).toMatch(/CRM/);
    expect(searchCrmTool.chatOnly).toBeUndefined();
  });

  it("applies the explicit client_id filter on contacts", async () => {
    const { client, builders } = createMockSupabase({
      contacts: { data: [{ contact_id: "c1", first_name: "John" }], error: null },
    });

    const result = await searchCrmTool.execute(
      { entity: "contacts", query: "John" },
      makeContext(client),
    );

    expect(result).toEqual({
      success: true,
      records: [{ contact_id: "c1", first_name: "John" }],
      count: 1,
    });
    expect(builders.contacts.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });

  it("returns { success: false, error } when Supabase errors", async () => {
    const { client } = createMockSupabase({
      contacts: { data: null, error: { message: "boom" } },
    });

    const result = await searchCrmTool.execute(
      { entity: "contacts" },
      makeContext(client),
    );

    expect(result).toEqual({ success: false, error: "boom" });
  });
});
