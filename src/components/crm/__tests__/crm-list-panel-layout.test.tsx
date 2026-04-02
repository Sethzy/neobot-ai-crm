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

vi.mock("@/components/ui/resizable", () => ({
  ResizableHandle: ({ withHandle }: { withHandle?: boolean }) => (
    <div data-testid="resizable-handle" data-with-handle={withHandle ? "true" : "false"} />
  ),
  ResizablePanel: ({
    children,
    className,
    defaultSize,
    minSize,
    maxSize,
  }: {
    children: React.ReactNode;
    className?: string;
    defaultSize?: string | number;
    minSize?: string | number;
    maxSize?: string | number;
  }) => (
    <div
      data-testid="resizable-panel"
      className={className}
      data-default-size={String(defaultSize ?? "")}
      data-min-size={String(minSize ?? "")}
      data-max-size={String(maxSize ?? "")}
    >
      {children}
    </div>
  ),
  ResizablePanelGroup: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid="resizable-panel-group" className={className}>
      {children}
    </div>
  ),
}));

describe("CrmListPanelLayout", () => {
  it("applies min-width guards to the desktop split-panel chain", () => {
    render(
      <CrmListPanelLayout
        objectType="contact"
        renderPanelContent={(recordId) => (
          <div data-testid="drawer-content">{recordId}</div>
        )}
      >
        <div>List content</div>
      </CrmListPanelLayout>,
    );

    expect(screen.getByTestId("resizable-panel-group")).toHaveClass("min-w-0");

    const panels = screen.getAllByTestId("resizable-panel");
    expect(panels[0]).toHaveClass("min-w-0");
    expect(panels[1]).toHaveClass("min-w-0");
    expect(panels[0]).toHaveAttribute("data-default-size", "65%");
    expect(panels[0]).toHaveAttribute("data-min-size", "40%");
    expect(panels[1]).toHaveAttribute("data-default-size", "35%");
    expect(panels[1]).toHaveAttribute("data-min-size", "25%");
    expect(panels[1]).toHaveAttribute("data-max-size", "50%");

    expect(screen.getByTestId("drawer-content").parentElement).toHaveClass("min-w-0");
  });
});
