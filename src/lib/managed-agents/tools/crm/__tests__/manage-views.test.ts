import { describe, expect, it, vi } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";

import { manageViewsTool } from "../manage-views";

function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const defaultResult = { data: null, error: null };

  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(
            overrides.insertResult ?? {
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
          ),
        }),
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue(overrides.selectResult ?? { data: [], error: null }),
            }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(overrides.updateResult ?? defaultResult),
            }),
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(overrides.deleteResult ?? defaultResult),
        }),
      }),
    }),
  };
}

vi.mock("@/lib/analytics/posthog-server", () => ({
  captureServerEvent: vi.fn(),
}));

function makeContext(supabase: ReturnType<typeof createMockSupabase>): ToolContext {
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
    const supabase = createMockSupabase();
    const result = await manageViewsTool.execute(
      {
        operation: "create",
        name: "Active pipeline",
        entity_type: "deals",
        filters: { stage: ["leads", "offer"] },
      },
      makeContext(supabase),
    );

    expect(result.success).toBe(true);
  });
});
