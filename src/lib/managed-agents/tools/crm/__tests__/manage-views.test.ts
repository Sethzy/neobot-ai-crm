import { describe, expect, it, vi } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";
import { createMockSupabase } from "@/lib/crm/__tests__/mock-supabase";

import { manageViewsTool } from "../manage-views";

vi.mock("@/lib/analytics/posthog-server", () => ({
  captureServerEvent: vi.fn(),
}));

function makeContext(supabase: ReturnType<typeof createMockSupabase>["client"]): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: supabase as any,
    clientId: "client-1",
    threadId: "thread-1",
    isChatContext: true,
  };
}

describe("manageViewsTool", () => {
  it("creates a view and returns it", async () => {
    const { client } = createMockSupabase({
      crm_views: {
        data: {
          view_id: "view-1",
          client_id: "client-1",
          name: "Active pipeline",
          entity_type: "deals",
          filters: { stage: ["leads", "offer"] },
          sort: null,
          is_default: false,
          is_seeded: false,
          created_at: "2026-04-05T00:00:00Z",
          updated_at: "2026-04-05T00:00:00Z",
        },
        error: null,
      },
    });
    const result = await manageViewsTool.execute(
      {
        operation: "create",
        name: "Active pipeline",
        entity_type: "deals",
        filters: { stage: ["leads", "offer"] },
      },
      makeContext(client),
    );

    expect(result.success).toBe(true);
  });

  it("returns not found when deleting a missing or cross-tenant view", async () => {
    const { client } = createMockSupabase({
      crm_views: { data: null, error: null },
    });

    const result = await manageViewsTool.execute(
      {
        operation: "delete",
        view_id: "550e8400-e29b-41d4-a716-446655440001",
      },
      makeContext(client),
    );

    expect(result).toEqual({
      success: false,
      error: "View not found.",
    });
  });
});
