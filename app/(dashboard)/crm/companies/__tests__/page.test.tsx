/**
 * Tests the legacy companies list route redirect behavior.
 * @module app/(dashboard)/crm/companies/__tests__/page
 */
import { describe, expect, it, vi } from "vitest";

const mockRedirect = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

describe("CompaniesRedirectPage", () => {
  it("redirects to /customers/companies", async () => {
    const module = await import("../page");

    try {
      module.default();
    } catch {
      // next/navigation redirect throws to short-circuit rendering.
    }

    expect(mockRedirect).toHaveBeenCalledWith("/customers/companies");
  });
});
