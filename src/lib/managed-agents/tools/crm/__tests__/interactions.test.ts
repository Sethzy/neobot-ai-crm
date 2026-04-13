import { describe, expect, it } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";
import { createMockSupabase } from "@/lib/crm/__tests__/mock-supabase";

import { createInteractionTool } from "../interactions";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

function makeContext(
  client: ReturnType<typeof createMockSupabase>["client"],
  overrides: Partial<ToolContext> = {},
): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: client as any,
    clientId: CLIENT_ID,
    threadId: "thread-1",
    isChatContext: true,
    ...overrides,
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

  it("accepts configured interaction vocabulary instead of only the baked defaults", async () => {
    const interaction = { interaction_id: "i1", contact_id: "c1", type: "stage_change" };
    const { client, builders } = createMockSupabase({
      interactions: { data: interaction, error: null },
    });

    const schemaCheck = createInteractionTool.inputSchema.safeParse({
      contact_id: "550e8400-e29b-41d4-a716-446655440001",
      type: "stage change",
    });

    expect(schemaCheck.success).toBe(true);

    const result = await createInteractionTool.execute(
      { contact_id: "c1", type: "stage change" },
      makeContext(client, {
        crmConfig: {
          deal_label: "Deal",
          company_label: "Company",
          deal_stages: ["leads"],
          contact_types: ["buyer", "other"],
          interaction_types: ["call", "stage_change"],
          deal_contact_roles: ["buyer"],
          company_industries: ["other"],
          deal_custom_fields: [],
          contact_custom_fields: [],
          company_custom_fields: [],
          task_custom_fields: [],
          contact_fields: [],
          company_fields: [],
          deal_fields: [],
        },
      }),
    );

    expect(result).toEqual({ success: true, interaction });
    expect(builders.interactions.insert).toHaveBeenCalledWith(
      expect.objectContaining({ type: "stage_change" }),
    );
  });
});
