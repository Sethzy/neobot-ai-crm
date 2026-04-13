import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";
import { createMockSupabase } from "@/lib/crm/__tests__/mock-supabase";

import { deleteRecordsTool } from "../delete-records";

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

describe("deleteRecordsTool", () => {
  beforeEach(() => {
    mockCaptureTimelineActivity.mockReset();
  });

  it("deletes a contact and applies the explicit client_id filter", async () => {
    const existingContact = {
      contact_id: "c1",
      client_id: CLIENT_ID,
      first_name: "John",
      last_name: "Tan",
    };
    const { client, builderHistory } = createMockSupabase({
      contacts: [
        { data: existingContact, error: null },
        { data: null, error: null },
      ],
      record_notes: { data: null, error: null },
    });

    const result = await deleteRecordsTool.execute(
      { entity: "contacts", ids: ["c1"], reason: "User requested removal" },
      makeContext(client),
    );

    expect(result).toEqual({ success: true, deleted_count: 1, ids: ["c1"] });
    expect(builderHistory.contacts[0]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(builderHistory.contacts[1]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(builderHistory.record_notes[0]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });
});
