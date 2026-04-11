import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";
import { createMockSupabase } from "@/lib/runner/tools/crm/__tests__/mock-supabase";

import { updateRecordTool } from "../update-record";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

const mockCaptureServerEvent = vi.fn();
const mockCaptureTimelineActivity = vi.fn();

vi.mock("@/lib/analytics/posthog-server", () => ({
  captureServerEvent: (...args: unknown[]) => mockCaptureServerEvent(...args),
  captureServerEvents: vi.fn(),
}));

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

describe("updateRecordTool", () => {
  beforeEach(() => {
    mockCaptureServerEvent.mockReset();
    mockCaptureTimelineActivity.mockReset();
  });

  it("updates a contact and applies the explicit client_id filter on read and write", async () => {
    const existing = {
      contact_id: "c1",
      client_id: CLIENT_ID,
      first_name: "John",
      last_name: "Tan",
      email: null,
    };
    const updated = { ...existing, email: "john@test.com" };
    const { client, builderHistory } = createMockSupabase({
      contacts: [
        { data: existing, error: null },
        { data: updated, error: null },
      ],
    });

    const result = await updateRecordTool.execute(
      {
        entity: "contacts",
        updates: [{ id: "c1", fields: { email: "john@test.com" } }],
      },
      makeContext(client),
    );

    expect(result).toEqual({ success: true, record: updated });
    expect(builderHistory.contacts[0]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(builderHistory.contacts[1]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });

  it("returns an error when no fields are provided", async () => {
    const { client } = createMockSupabase();

    const result = await updateRecordTool.execute(
      { entity: "contacts", updates: [{ id: "c1", fields: {} }] },
      makeContext(client),
    );

    expect(result).toEqual({ success: false, error: "No fields to update" });
  });
});
