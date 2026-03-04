/**
 * Tests debounce timing behavior for useDebouncedValue hook.
 * @module hooks/__tests__/use-debounced-value
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDebouncedValue } from "@/hooks/use-debounced-value";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("alpha", 300));

    expect(result.current).toBe("alpha");
  });

  it("updates value only after the delay has elapsed", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "alpha" } },
    );

    rerender({ value: "beta" });

    expect(result.current).toBe("alpha");

    act(() => {
      vi.advanceTimersByTime(299);
    });

    expect(result.current).toBe("alpha");

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current).toBe("beta");
  });

  it("cancels pending timer when value changes again before delay", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "alpha" } },
    );

    rerender({ value: "beta" });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    rerender({ value: "gamma" });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current).toBe("alpha");

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current).toBe("gamma");
  });
});
