/**
 * Tests for PDF highlight state context.
 * @module contexts/highlight-context.test
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { HighlightProvider, useHighlights, useSetHighlights } from "./highlight-context";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <HighlightProvider>{children}</HighlightProvider>
);

describe("useHighlights", () => {
  it("starts with empty highlights", () => {
    const { result } = renderHook(() => useHighlights(), { wrapper });
    expect(result.current.highlights).toEqual([]);
  });

  it("throws error when used outside provider", () => {
    expect(() => {
      renderHook(() => useHighlights());
    }).toThrow("useHighlights must be used within HighlightProvider");
  });
});

describe("useSetHighlights", () => {
  it("throws error when used outside provider", () => {
    expect(() => {
      renderHook(() => useSetHighlights());
    }).toThrow("useSetHighlights must be used within HighlightProvider");
  });

  it("updates highlights when setHighlights is called", () => {
    // Use single renderHook to share provider instance
    const { result } = renderHook(
      () => ({ reader: useHighlights(), setter: useSetHighlights() }),
      { wrapper }
    );

    const newHighlights = [{ height: 10, width: 20, top: 30, left: 40, pageIndex: 0 }];

    act(() => {
      result.current.setter.setHighlights(newHighlights);
    });

    expect(result.current.reader.highlights).toEqual(newHighlights);
  });

  it("calls jumpToPage with first highlight pageIndex when setting highlights", () => {
    const mockJumpToPage = vi.fn();
    // Use single renderHook to share provider instance
    const { result } = renderHook(
      () => ({ reader: useHighlights(), setter: useSetHighlights() }),
      { wrapper }
    );

    act(() => {
      result.current.reader.registerJumpToPage(mockJumpToPage);
    });

    act(() => {
      result.current.setter.setHighlights([
        { height: 10, width: 20, top: 30, left: 40, pageIndex: 2 },
      ]);
    });

    expect(mockJumpToPage).toHaveBeenCalledWith(2);
  });

  it("does not call jumpToPage when setting empty highlights", () => {
    const mockJumpToPage = vi.fn();
    // Use single renderHook to share provider instance
    const { result } = renderHook(
      () => ({ reader: useHighlights(), setter: useSetHighlights() }),
      { wrapper }
    );

    act(() => {
      result.current.reader.registerJumpToPage(mockJumpToPage);
    });

    act(() => {
      result.current.setter.setHighlights([]);
    });

    expect(mockJumpToPage).not.toHaveBeenCalled();
  });
});
