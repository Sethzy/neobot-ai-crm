/**
 * Tests backward-compatible deal detail route redirect behavior.
 * @module app/(dashboard)/crm/deals/[dealId]/__tests__/page
 */
import { describe, expect, it, vi } from "vitest";

import DealDetailPage from "../page";

const mockRedirect = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (href: string) => mockRedirect(href),
}));

describe("Deal detail route redirect", () => {
  it("redirects to deals list with detail query param", async () => {
    await DealDetailPage({
      params: { dealId: "d-1" },
    } as never);

    expect(mockRedirect).toHaveBeenCalledWith("/crm/deals?detail=d-1");
  });
});

