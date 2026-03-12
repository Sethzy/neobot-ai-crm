/**
 * Tests backward-compatible company detail route redirect behavior.
 * @module app/(dashboard)/crm/companies/[companyId]/__tests__/page
 */
import { describe, expect, it, vi } from "vitest";

import CompanyDetailRedirectPage from "../page";

const mockRedirect = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (href: string) => mockRedirect(href),
}));

describe("Company detail route redirect", () => {
  it("redirects to the new company detail route", async () => {
    await CompanyDetailRedirectPage({
      params: Promise.resolve({ companyId: "co-1" }),
    } as never);

    expect(mockRedirect).toHaveBeenCalledWith("/customers/companies/co-1");
  });
});
