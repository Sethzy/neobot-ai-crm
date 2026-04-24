/**
 * Regression tests for the Lenis wrapper cleanup.
 * @module components/landing/SmoothScroll.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import { SmoothScroll } from "./SmoothScroll";

const { LenisMock, lenisDestroy, lenisRaf } = vi.hoisted(() => {
  const destroy = vi.fn();
  const raf = vi.fn();

  return {
    LenisMock: vi.fn(function MockLenis() {
      return {
      destroy,
      raf,
      };
    }),
    lenisDestroy: destroy,
    lenisRaf: raf,
  };
});

vi.mock("lenis", () => ({
  default: LenisMock,
}));

describe("SmoothScroll", () => {
  beforeEach(() => {
    lenisDestroy.mockReset();
    lenisRaf.mockReset();
    LenisMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("cancels the scheduled animation frame when unmounting", () => {
    let nextFrameId = 0;
    const frameCallbacks = new Map<number, FrameRequestCallback>();
    const requestAnimationFrameMock = vi.fn((callback: FrameRequestCallback) => {
      nextFrameId += 1;
      frameCallbacks.set(nextFrameId, callback);
      return nextFrameId;
    });
    const cancelAnimationFrameMock = vi.fn();

    vi.stubGlobal("requestAnimationFrame", requestAnimationFrameMock);
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrameMock);
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );

    const { unmount } = render(
      <SmoothScroll>
        <div>Landing page</div>
      </SmoothScroll>,
    );

    expect(LenisMock).toHaveBeenCalledTimes(1);
    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);

    frameCallbacks.get(1)?.(16);

    expect(lenisRaf).toHaveBeenCalledWith(16);
    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(2);

    unmount();

    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(2);
    expect(lenisDestroy).toHaveBeenCalledTimes(1);
  });

  it("skips Lenis on mobile layouts", () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn());
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(max-width: 1023px)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );

    render(
      <SmoothScroll>
        <div>Landing page</div>
      </SmoothScroll>,
    );

    expect(LenisMock).not.toHaveBeenCalled();
  });
});
