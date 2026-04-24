/**
 * Tests keyboard and sidebar triggers for the app layout search surface.
 *
 * @module components/layout/app-layout.test
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { AppLayout } from "./app-layout";

vi.mock("next/dynamic", async () => {
  const React = await import("react");

  return {
    default: (
      loader: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>,
    ) => {
      return function DynamicComponent(props: Record<string, unknown>) {
        const [LoadedComponent, setLoadedComponent] = React.useState<
          React.ComponentType<Record<string, unknown>> | null
        >(null);

        React.useEffect(() => {
          let isMounted = true;

          void loader().then((module) => {
            if (isMounted) {
              setLoadedComponent(() => module.default);
            }
          });

          return () => {
            isMounted = false;
          };
        }, []);

        return LoadedComponent ? <LoadedComponent {...props} /> : null;
      };
    },
  };
});

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
  }) => (
    <div data-testid="command-menu-root">
      {open ? <input aria-label="Global search" placeholder="Search records..." /> : null}
    </div>
  ),
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

  it("does not mount the command menu before it is requested", () => {
    render(
      <AppLayout>
        <div>Page Content</div>
      </AppLayout>,
    );

    expect(screen.queryByTestId("command-menu-root")).not.toBeInTheDocument();
  });

  it("opens command menu when pressing Cmd+K", async () => {
    render(
      <AppLayout>
        <div>Page Content</div>
      </AppLayout>,
    );

    fireEvent.keyDown(document, { key: "k", metaKey: true });

    expect(await screen.findByTestId("command-menu-root")).toBeInTheDocument();
    expect(await screen.findByPlaceholderText("Search records...")).toBeInTheDocument();
  });

  it("opens command menu when pressing Ctrl+K", async () => {
    render(
      <AppLayout>
        <div>Page Content</div>
      </AppLayout>,
    );

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    expect(await screen.findByPlaceholderText("Search records...")).toBeInTheDocument();
  });

  it("opens command menu when sidebar triggers search", async () => {
    render(
      <AppLayout>
        <div>Page Content</div>
      </AppLayout>,
    );

    fireEvent.click(screen.getByTestId("sidebar-open-search"));

    expect(await screen.findByPlaceholderText("Search records...")).toBeInTheDocument();
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
