/**
 * Tests record drawer shell behavior and variant rendering.
 * @module components/crm/record-drawer/__tests__/record-drawer
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecordDrawer } from "../record-drawer";

let isMobile = false;

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => isMobile,
}));

vi.mock("@radix-ui/react-visually-hidden", () => ({
  VisuallyHidden: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div data-testid="sheet-root" data-open={open ? "true" : "false"}>
      {children}
      <button type="button" onClick={() => onOpenChange?.(false)}>
        close-sheet
      </button>
    </div>
  ),
  SheetContent: ({
    children,
    side,
  }: {
    children: React.ReactNode;
    side: "right" | "bottom" | "top" | "left";
  }) => (
    <div data-testid="sheet-content" data-side={side}>
      {children}
    </div>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("../contact-drawer-content", () => ({
  ContactDrawerContent: ({ contactId }: { contactId: string }) => (
    <div data-testid="contact-content">{contactId}</div>
  ),
}));

vi.mock("../deal-drawer-content", () => ({
  DealDrawerContent: ({ dealId }: { dealId: string }) => <div data-testid="deal-content">{dealId}</div>,
}));

vi.mock("../company-drawer-content", () => ({
  CompanyDrawerContent: ({ companyId }: { companyId: string }) => (
    <div data-testid="company-content">{companyId}</div>
  ),
}));

vi.mock("../task-drawer-content", () => ({
  TaskDrawerContent: ({ taskId }: { taskId: string }) => <div data-testid="task-content">{taskId}</div>,
}));

describe("RecordDrawer", () => {
  beforeEach(() => {
    isMobile = false;
  });

  it("renders no record content when closed", () => {
    render(<RecordDrawer isOpen={false} recordId={null} objectType="contact" onClose={vi.fn()} />);

    expect(screen.queryByTestId("contact-content")).not.toBeInTheDocument();
  });

  it("renders contact content when opened for contact", () => {
    render(<RecordDrawer isOpen={true} recordId="c-1" objectType="contact" onClose={vi.fn()} />);

    expect(screen.getByTestId("contact-content")).toHaveTextContent("c-1");
  });

  it("renders deal, company, and task variants by object type", () => {
    const { rerender } = render(
      <RecordDrawer isOpen={true} recordId="d-1" objectType="deal" onClose={vi.fn()} />,
    );
    expect(screen.getByTestId("deal-content")).toHaveTextContent("d-1");

    rerender(<RecordDrawer isOpen={true} recordId="co-1" objectType="company" onClose={vi.fn()} />);
    expect(screen.getByTestId("company-content")).toHaveTextContent("co-1");

    rerender(<RecordDrawer isOpen={true} recordId="t-1" objectType="task" onClose={vi.fn()} />);
    expect(screen.getByTestId("task-content")).toHaveTextContent("t-1");
  });

  it("uses right side on desktop and bottom side on mobile", () => {
    const { rerender } = render(
      <RecordDrawer isOpen={true} recordId="c-1" objectType="contact" onClose={vi.fn()} />,
    );
    expect(screen.getByTestId("sheet-content")).toHaveAttribute("data-side", "right");

    isMobile = true;
    rerender(<RecordDrawer isOpen={true} recordId="c-1" objectType="contact" onClose={vi.fn()} />);
    expect(screen.getByTestId("sheet-content")).toHaveAttribute("data-side", "bottom");
  });

  it("calls onClose when sheet requests close", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<RecordDrawer isOpen={true} recordId="c-1" objectType="contact" onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "close-sheet" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
