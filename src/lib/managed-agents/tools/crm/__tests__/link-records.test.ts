import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";
import { createMockSupabase } from "@/lib/crm/__tests__/mock-supabase";

import { linkRecordsTool } from "../link-records";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

const mockCaptureTimelineActivity = vi.fn();
vi.mock("@/lib/crm/timeline-capture", () => ({
  captureTimelineActivity: (...args: unknown[]) => mockCaptureTimelineActivity(...args),
}));

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

describe("linkRecordsTool", () => {
  beforeEach(() => {
    mockCaptureTimelineActivity.mockReset();
  });

  it("links a contact to a deal through the junction table", async () => {
    const inserted = { contact_id: "c1", deal_id: "d1", role: "buyer", is_primary: false };
    const { client, builders } = createMockSupabase({
      deal_contacts: { data: inserted, error: null },
    });

    const result = await linkRecordsTool.execute(
      {
        action: "link",
        relationship: "contact_deal",
        source_id: "c1",
        target_id: "d1",
      },
      makeContext(client),
    );

    expect(result).toEqual({ success: true, link: inserted });
    expect(builders.deal_contacts.insert).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: CLIENT_ID, contact_id: "c1", deal_id: "d1" }),
    );
  });

  it("unlinks a contact from a company and uses the explicit client_id filter", async () => {
    const existing = { contact_id: "c1", client_id: CLIENT_ID, company_id: "co1" };
    const updated = { ...existing, company_id: null };
    const { client, builderHistory } = createMockSupabase({
      contacts: [
        { data: existing, error: null },
        { data: updated, error: null },
      ],
    });

    const result = await linkRecordsTool.execute(
      { action: "unlink", relationship: "contact_company", source_id: "c1" },
      makeContext(client),
    );

    expect(result).toEqual({ success: true, removed: updated });
    expect(builderHistory.contacts[0]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(builderHistory.contacts[1]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });

  it("refuses to link a contact to a deal the tenant does not own", async () => {
    const { client } = createMockSupabase({
      contacts: { data: { contact_id: "c1", client_id: CLIENT_ID }, error: null },
      deals: { data: null, error: null },
    });

    const result = await linkRecordsTool.execute(
      {
        action: "link",
        relationship: "contact_deal",
        source_id: "c1",
        target_id: "d1",
      },
      makeContext(client),
    );

    expect(result).toEqual({
      success: false,
      error: "Target record not found.",
    });
  });
});
