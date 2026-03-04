/**
 * Tests localStorage-backed CRM view preference hook behavior.
 * @module hooks/__tests__/use-view-preference
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useViewPreference } from "@/hooks/use-view-preference";

describe("useViewPreference", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to table", () => {
    const { result } = renderHook(() => useViewPreference("deals"));

    expect(result.current.view).toBe("table");
  });

  it("persists selection to localStorage", () => {
    const { result } = renderHook(() => useViewPreference("deals"));

    act(() => {
      result.current.setView("kanban");
    });

    expect(result.current.view).toBe("kanban");
    expect(localStorage.getItem("view-deals")).toBe("kanban");
  });

  it("ignores invalid localStorage values", () => {
    localStorage.setItem("view-deals", "invalid");

    const { result } = renderHook(() => useViewPreference("deals"));

    expect(result.current.view).toBe("table");
  });
});
