/**
 * Tests the legacy deals list route redirect behavior.
 * @module app/(dashboard)/crm/deals/__tests__/page
 */
import { describe, expect, it, vi } from "vitest";

const mockRedirect = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

describe("DealsRedirectPage", () => {
  it("redirects to /customers/deals", async () => {
    const module = await import("../page");

    try {
      module.default();
    } catch {
      // next/navigation redirect throws to short-circuit rendering.
    }

    expect(mockRedirect).toHaveBeenCalledWith("/customers/deals");
  });
});
