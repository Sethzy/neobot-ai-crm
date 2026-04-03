/**
 * Regression tests for the CRM split-panel desktop layout.
 * @module components/crm/__tests__/crm-list-panel-layout
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CrmListPanelLayout } from "@/components/crm/crm-list-panel-layout";

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/hooks/use-record-drawer", () => ({
  useRecordDrawer: () => ({
    isOpen: true,
    recordId: "contact-1",
    close: vi.fn(),
  }),
}));

describe("CrmListPanelLayout", () => {
  it("renders the list content and detail panel side by side on desktop", () => {
    render(
      <CrmListPanelLayout
        objectType="contact"
        renderPanelContent={(recordId, { closeButton }) => (
          <div>
            {closeButton}
            <div data-testid="drawer-content">{recordId}</div>
          </div>
        )}
      >
        <div data-testid="list-content">List content</div>
      </CrmListPanelLayout>,
    );

    expect(screen.getByTestId("list-content")).toBeInTheDocument();
    expect(screen.getByTestId("drawer-content")).toBeInTheDocument();
    expect(screen.getByText("contact-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close panel" })).toBeInTheDocument();
  });
});
