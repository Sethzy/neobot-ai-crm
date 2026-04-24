/**
 * Tests for the settings nav surfaces.
 * @module components/settings/settings-nav.test
 */
import type React from "react";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { resolveSettingsCurrentTitle } from "../settings-nav-meta";
import { SettingsMobileNav } from "../settings-mobile-nav";
import { SettingsNav, SETTINGS_NAV_SECTIONS } from "../settings-nav";

let pathname = "/settings/profile";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("@/components/ui/sheet", async () => {
  const React = await import("react");
  const SheetContext = React.createContext<{
    onOpenChange?: (open: boolean) => void;
    open: boolean;
  } | null>(null);

  return {
    Sheet: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode;
      open: boolean;
      onOpenChange?: (open: boolean) => void;
    }) => (
      <SheetContext.Provider value={{ open, onOpenChange }}>
        <div data-testid="sheet-root" data-open={open ? "true" : "false"}>
          {children}
        </div>
      </SheetContext.Provider>
    ),
    SheetTrigger: ({ children }: { children: React.ReactElement }) => {
      const context = React.useContext(SheetContext);
      return React.cloneElement(children, {
        onClick: () => context?.onOpenChange?.(!context.open),
      });
    },
    SheetContent: ({ children }: { children: React.ReactNode }) => {
      const context = React.useContext(SheetContext);
      return context?.open ? <div data-testid="sheet-content">{children}</div> : null;
    },
    SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

function hasRenderPhaseWarning(errorSpy: ReturnType<typeof vi.spyOn>) {
  return errorSpy.mock.calls.some((call) =>
    call.some((value) =>
      String(value).includes("Cannot update a component while rendering a different component")
    )
  );
}

describe("SettingsNav", () => {
  it("renders three sections", () => {
    render(<SettingsNav />);
    expect(screen.getByText("User")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
  });

  it("renders all 7 items across sections", () => {
    render(<SettingsNav />);
    const expectedLabels = SETTINGS_NAV_SECTIONS.flatMap((s) =>
      s.items.map((i) => i.label),
    );
    expect(expectedLabels).toHaveLength(7);
    for (const label of expectedLabels) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("marks the item matching the current pathname as active", () => {
    render(<SettingsNav />);
    const activeLink = screen.getByRole("link", { name: "Profile" });
    expect(activeLink).toHaveAttribute("aria-current", "page");
  });

  it("does not mark other items as active", () => {
    render(<SettingsNav />);
    const inactiveLink = screen.getByRole("link", { name: "Billing" });
    expect(inactiveLink).not.toHaveAttribute("aria-current");
  });

  it("closes the mobile sheet on route change without render-phase warnings", async () => {
    pathname = "/settings/profile";
    const user = userEvent.setup();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { rerender } = render(<SettingsMobileNav />);

    await user.click(screen.getByRole("button", { name: /open settings navigation/i }));
    expect(screen.getByTestId("sheet-content")).toBeInTheDocument();

    pathname = "/settings/workspace/billing";
    rerender(<SettingsMobileNav />);

    await waitFor(() => {
      expect(screen.queryByTestId("sheet-content")).not.toBeInTheDocument();
    });

    expect(hasRenderPhaseWarning(consoleErrorSpy)).toBe(false);
    consoleErrorSpy.mockRestore();
  });

  it("derives the current mobile title from the shared nav metadata", () => {
    expect(
      resolveSettingsCurrentTitle("/settings/agent/memory", SETTINGS_NAV_SECTIONS),
    ).toBe("Personality");
  });
});
