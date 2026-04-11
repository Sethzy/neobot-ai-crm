import { describe, expect, it } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";
import { createMockSupabase } from "@/lib/runner/tools/crm/__tests__/mock-supabase";

import { configureCrmTool } from "../configure-crm";

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

describe("configureCrmTool", () => {
  it("upserts deduplicated vocabulary updates and returns the resolved config", async () => {
    const updatedRow = {
      config_id: "cfg-1",
      client_id: CLIENT_ID,
      deal_label: "Policy",
      company_label: "Brokerage",
      deal_stages: ["lead", "quoted"],
      contact_types: null,
      interaction_types: null,
      deal_contact_roles: null,
      company_industries: ["property_agency", "developer"],
      deal_custom_fields: [],
      contact_custom_fields: [],
      company_custom_fields: [],
      task_custom_fields: [],
      contact_fields: [],
      company_fields: [],
      deal_fields: [],
    };
    const { client, builderHistory } = createMockSupabase({
      crm_config: [
        { data: null, error: null },
        { data: null, error: null },
        { data: updatedRow, error: null },
      ],
    });

    const result = await configureCrmTool.execute(
      { deal_label: "Policy", deal_stages: ["lead", "quoted", "lead"] },
      makeContext(client),
    );

    expect(builderHistory.crm_config[2]?.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        deal_label: "Policy",
        deal_stages: ["lead", "quoted"],
      }),
      { onConflict: "client_id" },
    );
    expect(result).toMatchObject({
      success: true,
      resolved_config: expect.objectContaining({ deal_label: "Policy" }),
    });
  });
});
