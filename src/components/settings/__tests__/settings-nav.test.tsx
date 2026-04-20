/**
 * Tests for the settings inner-rail nav.
 * @module components/settings/settings-nav.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SettingsNav, SETTINGS_NAV_SECTIONS } from "../settings-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/profile",
}));

describe("SettingsNav", () => {
  it("renders three sections", () => {
    render(<SettingsNav />);
    expect(screen.getByText("User")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
  });

  it("renders all 8 items across sections", () => {
    render(<SettingsNav />);
    const expectedLabels = SETTINGS_NAV_SECTIONS.flatMap((s) =>
      s.items.map((i) => i.label),
    );
    expect(expectedLabels).toHaveLength(8);
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
});
