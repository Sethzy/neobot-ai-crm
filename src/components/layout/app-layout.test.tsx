/**
 * Tests keyboard and sidebar triggers for the app layout search surface.
 *
 * @module components/layout/app-layout.test
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { AppLayout } from "./app-layout";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("./app-sidebar", () => ({
  AppSidebar: ({ onOpenCommandMenu }: { onOpenCommandMenu?: () => void }) => (
    <button
      type="button"
      data-testid="sidebar-open-search"
      onClick={onOpenCommandMenu}
    >
      Sidebar
    </button>
  ),
}));

vi.mock("@/components/command-menu", () => ({
  CommandMenu: ({
    open,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => (open ? <input aria-label="Global search" placeholder="Search records..." /> : null),
}));

describe("AppLayout", () => {
  it("renders sidebar and children", () => {
    render(
      <AppLayout>
        <div>Page Content</div>
      </AppLayout>,
    );

    expect(screen.getByTestId("sidebar-open-search")).toBeInTheDocument();
    expect(screen.getByText("Page Content")).toBeInTheDocument();
  });

  it("opens command menu when pressing Cmd+K", () => {
    render(
      <AppLayout>
        <div>Page Content</div>
      </AppLayout>,
    );

    fireEvent.keyDown(document, { key: "k", metaKey: true });

    expect(screen.getByPlaceholderText("Search records...")).toBeInTheDocument();
  });

  it("opens command menu when pressing Ctrl+K", () => {
    render(
      <AppLayout>
        <div>Page Content</div>
      </AppLayout>,
    );

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    expect(screen.getByPlaceholderText("Search records...")).toBeInTheDocument();
  });

  it("opens command menu when sidebar triggers search", () => {
    render(
      <AppLayout>
        <div>Page Content</div>
      </AppLayout>,
    );

    fireEvent.click(screen.getByTestId("sidebar-open-search"));

    expect(screen.getByPlaceholderText("Search records...")).toBeInTheDocument();
  });

  it("does not open command menu when shortcut is pressed inside an input field", () => {
    render(
      <AppLayout>
        <input data-testid="typing-input" />
      </AppLayout>,
    );

    const input = screen.getByTestId("typing-input");
    input.focus();
    fireEvent.keyDown(input, { key: "k", metaKey: true });

    expect(
      screen.queryByPlaceholderText("Search records..."),
    ).not.toBeInTheDocument();
  });
});
