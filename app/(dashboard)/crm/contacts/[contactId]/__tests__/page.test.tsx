/**
 * Tests backward-compatible contact detail route redirect behavior.
 * @module app/(dashboard)/crm/contacts/[contactId]/__tests__/page
 */
import { describe, expect, it, vi } from "vitest";

import ContactDetailPage from "../page";

const mockRedirect = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (href: string) => mockRedirect(href),
}));

describe("Contact detail route redirect", () => {
  it("redirects to the new people detail route", async () => {
    await ContactDetailPage({
      params: Promise.resolve({ contactId: "c-1" }),
    } as never);

    expect(mockRedirect).toHaveBeenCalledWith("/customers/people/c-1");
  });
});
