/**
 * Tests for CRM landing page redirect behavior.
 * @module app/(dashboard)/crm/__tests__/page
 */
import { describe, expect, it, vi } from "vitest";

const mockRedirect = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

describe("CrmPage", () => {
  it("redirects to /crm/contacts", async () => {
    const module = await import("../page");

    try {
      module.default();
    } catch {
      // next/navigation redirect throws to short-circuit rendering.
    }

    expect(mockRedirect).toHaveBeenCalledWith("/crm/contacts");
  });
});
