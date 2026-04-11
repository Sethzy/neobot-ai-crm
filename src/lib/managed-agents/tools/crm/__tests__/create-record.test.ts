import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";
import { createMockSupabase } from "@/lib/runner/tools/crm/__tests__/mock-supabase";

import { createRecordTool } from "../create-record";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

vi.mock("@/lib/analytics/posthog-server", () => ({
  captureServerEvent: vi.fn(),
  captureServerEvents: vi.fn(),
}));

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

describe("createRecordTool", () => {
  beforeEach(() => {
    mockCaptureTimelineActivity.mockReset();
  });

  it("creates a single contact after duplicate check and uses the explicit client_id filter", async () => {
    const inserted = { contact_id: "c1", first_name: "John", last_name: "Tan" };
    const { client, builderHistory } = createMockSupabase({
      contacts: [
        { data: [], error: null },
        { data: inserted, error: null },
      ],
    });

    const result = await createRecordTool.execute(
      {
        entity: "contacts",
        records: [{ first_name: "John", last_name: "Tan" }],
      },
      makeContext(client),
    );

    expect(result).toEqual({ success: true, record: inserted, count: 1 });
    expect(builderHistory.contacts[0]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(builderHistory.contacts[1]?.insert).toHaveBeenCalled();
  });

  it("returns possible_duplicates when duplicate detection finds a match", async () => {
    const { client } = createMockSupabase({
      contacts: {
        data: [{ contact_id: "c1", first_name: "John", last_name: "Tan" }],
        error: null,
      },
    });

    const result = await createRecordTool.execute(
      {
        entity: "contacts",
        records: [{ first_name: "John", last_name: "Tan" }],
      },
      makeContext(client),
    );

    expect(result.success).toBe(false);
    expect(result).toMatchObject({ reason: "possible_duplicates" });
  });
});
