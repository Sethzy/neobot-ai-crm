import { describe, expect, it } from "vitest";

import { normalizeCrmView, normalizeCrmViewState } from "../view-state";

describe("normalizeCrmViewState", () => {
  it("fills defaults for missing state properties", () => {
    const result = normalizeCrmViewState({
      entityType: "deals",
      state: {
        filters: { stage: ["closing"] },
        sort: { column: "updated_at", ascending: false },
        isDefault: true,
      },
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

  it("falls back to empty filters when the persisted filter payload is malformed", () => {
    const result = normalizeCrmViewState({
      entityType: "deals",
      state: {
        filters: {
          stage: ["closing"],
          invalid: { nested: true },
        },
      },
    });

    expect(result.filters).toEqual({});
  });

  it("preserves valid workspace settings when one state property is malformed", () => {
    const result = normalizeCrmViewState({
      entityType: "deals",
      state: {
        viewType: "kanban",
        openMode: "page",
        sort: {
          column: "updated_at",
          ascending: false,
        },
        columns: ["amount", 42, "stage", "amount"],
        columnOrder: ["stage", null, "amount"],
      },
    });

    expect(result.viewType).toBe("kanban");
    expect(result.openMode).toBe("page");
    expect(result.sort).toEqual({ column: "updated_at", ascending: false });
    expect(result.columns).toEqual(["amount", "stage"]);
    expect(result.columnOrder).toEqual(["stage", "amount"]);
  });

  it("returns safe defaults when state is missing entirely", () => {
    const result = normalizeCrmViewState({ entityType: "deals" });

    expect(result).toEqual({
      version: 1,
      viewType: "table",
      filters: {},
      sort: null,
      columns: [],
      columnOrder: [],
      groupBy: null,
      calendarField: null,
      openMode: "drawer",
      isDefault: false,
    });
  });
});

describe("normalizeCrmView", () => {
  it("parses the row's state into the current contract", () => {
    const result = normalizeCrmView({
      view_id: "550e8400-e29b-41d4-a716-446655440001",
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      name: "Pipeline",
      entity_type: "deals",
      state: {
        viewType: "kanban",
        openMode: "page",
        filters: { stage: ["offer"] },
      },
      is_seeded: false,
      created_at: "2026-04-23T00:00:00+00:00",
      updated_at: "2026-04-23T00:00:00+00:00",
    });

    expect(result.state.viewType).toBe("kanban");
    expect(result.state.openMode).toBe("page");
    expect(result.state.filters).toEqual({ stage: ["offer"] });
    expect(result.state.isDefault).toBe(false);
  });
});
