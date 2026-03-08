/**
 * Tests for CRM route layout shell.
 * @module app/(dashboard)/crm/__tests__/layout
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CrmLayout from "../layout";

const mockUsePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

describe("CrmLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue("/crm/contacts");
  });

  it("renders contacts, deals, and companies tabs around child content", () => {
    render(
      <CrmLayout>
        <div>CRM Child Content</div>
      </CrmLayout>,
    );

    expect(screen.getByRole("link", { name: /contacts/i })).toHaveAttribute(
      "href",
      "/crm/contacts",
    );
    expect(screen.getByRole("link", { name: /deals/i })).toHaveAttribute(
      "href",
      "/crm/deals",
    );
    expect(screen.getByRole("link", { name: /companies/i })).toHaveAttribute(
      "href",
      "/crm/companies",
    );
    expect(screen.getByText("CRM Child Content")).toBeInTheDocument();
  });

  it("marks deals tab as active on /crm/deals routes", () => {
    mockUsePathname.mockReturnValue("/crm/deals");

    render(
      <CrmLayout>
        <div>CRM Child Content</div>
      </CrmLayout>,
    );

    const dealsLink = screen.getByRole("link", { name: /deals/i });
    expect(dealsLink.className).toContain("border-foreground");
  });
});
