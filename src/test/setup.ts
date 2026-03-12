/**
 * Vitest setup file - runs before all tests.
 */
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

vi.mock("posthog-js", () => ({
  default: {
    capture: vi.fn(),
    identify: vi.fn(),
    init: vi.fn(),
    reset: vi.fn(),
  },
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  writable: true,
  value: MockResizeObserver,
});

Object.defineProperty(window.HTMLElement.prototype, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
  writable: true,
  value: () => {},
});
