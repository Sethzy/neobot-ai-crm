import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useActiveCrmViewState } from "../use-active-crm-view-state";

describe("useActiveCrmViewState", () => {
  it("treats the saved view as authoritative for layout and open mode", () => {
    const { result } = renderHook(() =>
      useActiveCrmViewState({
        activeViewId: "view-1",
        adHocViewType: "table",
        allowPageOpen: true,
        supportedViewTypes: ["table", "kanban"],
        views: [
          {
            view_id: "view-1",
            client_id: "client-1",
            name: "Pipeline",
            entity_type: "deals",
            filters: { stage: ["closing"] },
            sort: null,
            state: {
              version: 1,
              viewType: "kanban",
              filters: { stage: ["closing"] },
              sort: null,
              columns: [],
              columnOrder: [],
              groupBy: "stage",
              calendarField: null,
              openMode: "page",
              isDefault: false,
            },
            is_default: false,
            is_seeded: false,
            created_at: "2026-04-23T00:00:00+00:00",
            updated_at: "2026-04-23T00:00:00+00:00",
          },
        ],
      }),
    );

    expect(result.current.isSavedViewActive).toBe(true);
    expect(result.current.activeViewType).toBe("kanban");
    expect(result.current.openMode).toBe("page");
  });

  it("falls back to ad hoc state when the saved view id is stale", () => {
    const { result } = renderHook(() =>
      useActiveCrmViewState({
        activeViewId: "missing",
        adHocViewType: "calendar",
        supportedViewTypes: ["table", "kanban", "calendar"],
        views: [],
      }),
    );

    expect(result.current.activeSavedView).toBeNull();
    expect(result.current.hasInvalidSavedView).toBe(true);
    expect(result.current.activeViewType).toBe("calendar");
    expect(result.current.openMode).toBe("drawer");
  });
});
