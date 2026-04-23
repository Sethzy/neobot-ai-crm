import { describe, expect, it } from "vitest";

import { normalizeCrmView, normalizeCrmViewState } from "../view-state";

describe("normalizeCrmViewState", () => {
  it("backfills the new workspace shape from legacy filters and sort", () => {
    const result = normalizeCrmViewState({
      entityType: "deals",
      filters: { stage: ["closing"] },
      sort: { column: "updated_at", ascending: false },
      isDefault: true,
    });

    expect(result).toEqual({
      version: 1,
      viewType: "table",
      filters: { stage: ["closing"] },
      sort: { column: "updated_at", ascending: false },
      columns: [],
      columnOrder: [],
      groupBy: null,
      calendarField: null,
      openMode: "drawer",
      isDefault: true,
    });
  });

  it("drops invalid filters and unsupported sort columns instead of crashing", () => {
    const result = normalizeCrmViewState({
      entityType: "contacts",
      state: {
        filters: {
          type: "buyer",
          unsupported: "nope",
        },
        sort: {
          column: "unsupported",
          ascending: true,
        },
      },
    });

    expect(result.filters).toEqual({ type: "buyer" });
    expect(result.sort).toBeNull();
  });
});

describe("normalizeCrmView", () => {
  it("returns normalized state plus legacy compatibility aliases", () => {
    const result = normalizeCrmView({
      view_id: "550e8400-e29b-41d4-a716-446655440001",
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      name: "Pipeline",
      entity_type: "deals",
      filters: { stage: ["offer"] },
      sort: null,
      state: {
        viewType: "kanban",
        openMode: "page",
      },
      is_default: false,
      is_seeded: false,
      created_at: "2026-04-23T00:00:00+00:00",
      updated_at: "2026-04-23T00:00:00+00:00",
    });

    expect(result.filters).toEqual({ stage: ["offer"] });
    expect(result.sort).toBeNull();
    expect(result.state.viewType).toBe("kanban");
    expect(result.state.openMode).toBe("page");
    expect(result.is_default).toBe(false);
  });
});
