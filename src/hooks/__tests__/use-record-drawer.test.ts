/**
 * Tests query-param-driven record drawer state behavior.
 * @module hooks/__tests__/use-record-drawer
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRecordDrawer } from "@/hooks/use-record-drawer";

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => "/crm/contacts",
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => mockSearchParams,
}));

describe("useRecordDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.forEach((_, key) => {
      mockSearchParams.delete(key);
    });
  });

  it("returns closed state when detail param is absent", () => {
    const { result } = renderHook(() => useRecordDrawer());

    expect(result.current.isOpen).toBe(false);
    expect(result.current.recordId).toBeNull();
  });

  it("returns open state when detail param exists", () => {
    mockSearchParams.set("detail", "c-1");

    const { result } = renderHook(() => useRecordDrawer());

    expect(result.current.isOpen).toBe(true);
    expect(result.current.recordId).toBe("c-1");
  });

  it("open pushes detail query param and preserves existing params", () => {
    mockSearchParams.set("search", "sarah");
    const { result } = renderHook(() => useRecordDrawer());

    act(() => result.current.open("c-2"));

    expect(mockPush).toHaveBeenCalledWith("/crm/contacts?search=sarah&detail=c-2", {
      scroll: false,
    });
  });

  it("close removes detail param and keeps other query params", () => {
    mockSearchParams.set("search", "sarah");
    mockSearchParams.set("detail", "c-2");
    const { result } = renderHook(() => useRecordDrawer());

    act(() => result.current.close());

    expect(mockReplace).toHaveBeenCalledWith("/crm/contacts?search=sarah", { scroll: false });
  });

  it("close replaces to pathname when detail is the only query param", () => {
    mockSearchParams.set("detail", "c-2");
    const { result } = renderHook(() => useRecordDrawer());

    act(() => result.current.close());

    expect(mockReplace).toHaveBeenCalledWith("/crm/contacts", { scroll: false });
  });
});
