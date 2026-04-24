/**
 * Tests the shared CRM inline-cell wrappers.
 * @module components/crm/__tests__/crm-inline-cells
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  EmailQuickEditCell,
  LinkQuickEditCell,
  PhoneQuickEditCell,
  SelectQuickEditCell,
  WebsiteQuickEditCell,
} from "@/components/crm/crm-inline-cells";
import { useIsMobile } from "@/hooks/use-mobile";

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: vi.fn(() => false),
}));

describe("crm-inline-cells", () => {
  it("preserves a tel link in read mode", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);

    render(
      <LinkQuickEditCell
        ariaLabel="Phone"
        value="+1 415 555 0100"
        hrefBuilder={(value) => `tel:${value}`}
        linkClassName="truncate"
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: "+1 415 555 0100" })).toHaveAttribute(
      "href",
      "tel:+1 415 555 0100",
    );
  });

  it("supports read-mode children on select cells", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);

    render(
      <SelectQuickEditCell
        ariaLabel="Company"
        value="company-1"
        displayValue="ACME Realty"
        options={[{ value: "company-1", label: "ACME Realty" }]}
        onSave={vi.fn()}
      >
        <a href="/customers/companies/company-1">ACME Realty</a>
      </SelectQuickEditCell>,
    );

    expect(screen.getByRole("link", { name: "ACME Realty" })).toHaveAttribute(
      "href",
      "/customers/companies/company-1",
    );
  });

  it("uses the shared email wrapper defaults", () => {
    render(
      <EmailQuickEditCell
        ariaLabel="Email"
        value="hello@acme.example"
        linkClassName="truncate"
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: "hello@acme.example" })).toHaveAttribute(
      "href",
      "mailto:hello@acme.example",
    );
  });

  it("uses the shared phone wrapper defaults", () => {
    render(
      <PhoneQuickEditCell
        ariaLabel="Phone"
        value="+65 9123 4567"
        linkClassName="truncate"
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: "+65 9123 4567" })).toHaveAttribute(
      "href",
      "tel:+65 9123 4567",
    );
  });

  it("uses the shared website wrapper defaults", () => {
    render(
      <WebsiteQuickEditCell
        ariaLabel="Website"
        value="acme.example"
        linkClassName="truncate"
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: "acme.example" })).toHaveAttribute(
      "href",
      "https://acme.example",
    );
    expect(screen.getByRole("link", { name: "acme.example" })).toHaveAttribute(
      "target",
      "_blank",
    );
  });
});
