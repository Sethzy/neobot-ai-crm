/**
 * Tests legacy deals pipeline redirect behavior.
 * @module app/(dashboard)/customers/deals/pipeline/__tests__/page
 */
import { describe, expect, it, vi } from "vitest";

const mockRedirect = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

describe("DealsPipelinePage", () => {
  it("redirects the legacy pipeline route to the unified board view", async () => {
    const module = await import("../page");

    try {
      module.default();
    } catch {
      // next/navigation redirect throws to short-circuit rendering.
    }

    expect(mockRedirect).toHaveBeenCalledWith("/customers/deals?view=kanban");
  });
});
