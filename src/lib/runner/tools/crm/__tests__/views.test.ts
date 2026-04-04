/**
 * Tests for CRM saved view tools.
 * @module lib/runner/tools/crm/__tests__/views.test
 */
import { describe, expect, it, vi } from "vitest";

import { createViewTools } from "../views";

// Mock Supabase — follow the pattern in tasks.test.ts
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
              order: vi.fn().mockResolvedValue(
                overrides.selectResult ?? { data: [], error: null },
              ),
            }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(
                overrides.updateResult ?? defaultResult,
              ),
            }),
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(
            overrides.deleteResult ?? defaultResult,
          ),
        }),
      }),
    }),
  };
}

// Mock analytics
vi.mock("@/lib/analytics/posthog-server", () => ({
  captureServerEvent: vi.fn(),
}));

describe("manage_views tool", () => {
  it("creates a view and returns it", async () => {
    const supabase = createMockSupabase();
    const tools = createViewTools(supabase as never, "client-1");
    const result = await tools.manage_views.execute(
      {
        operation: "create",
        name: "Active pipeline",
        entity_type: "deals",
        filters: { stage: ["leads", "offer"] },
      },
      { toolCallId: "tc-1", messages: [] },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.view.name).toBe("Active pipeline");
    }
  });

  it("lists views for an entity type", async () => {
    const supabase = createMockSupabase({
      selectResult: {
        data: [{ view_id: "v1", name: "Active pipeline", entity_type: "deals" }],
        error: null,
      },
    });
    const tools = createViewTools(supabase as never, "client-1");
    const result = await tools.manage_views.execute(
      { operation: "list", entity_type: "deals" },
      { toolCallId: "tc-2", messages: [] },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.views).toHaveLength(1);
    }
  });

  it("deletes a view", async () => {
    const supabase = createMockSupabase({
      deleteResult: { data: null, error: null, count: 1 },
    });
    const tools = createViewTools(supabase as never, "client-1");
    const result = await tools.manage_views.execute(
      { operation: "delete", view_id: "view-1" },
      { toolCallId: "tc-3", messages: [] },
    );
    expect(result.success).toBe(true);
  });
});
