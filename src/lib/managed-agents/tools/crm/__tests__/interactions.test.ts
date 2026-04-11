import { describe, expect, it } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";
import { createMockSupabase } from "@/lib/runner/tools/crm/__tests__/mock-supabase";

import { createInteractionTool } from "../interactions";

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

describe("createInteractionTool", () => {
  it("creates an interaction with the tenant-scoped insert payload", async () => {
    const interaction = { interaction_id: "i1", contact_id: "c1", type: "call" };
    const { client, builders } = createMockSupabase({
      interactions: { data: interaction, error: null },
    });

    const result = await createInteractionTool.execute(
      { contact_id: "c1", type: "call" },
      makeContext(client),
    );

    expect(result).toEqual({ success: true, interaction });
    expect(builders.interactions.insert).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: CLIENT_ID, contact_id: "c1", type: "call" }),
    );
  });
});
