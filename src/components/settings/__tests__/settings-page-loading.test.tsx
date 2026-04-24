/**
 * Tests for the settings route loading shell.
 * @module components/settings/__tests__/settings-page-loading.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SettingsPageLoading } from "../settings-page-loading";

describe("SettingsPageLoading", () => {
  it("renders the inner settings content placeholders", () => {
    render(<SettingsPageLoading />);

    expect(screen.getByTestId("settings-page-loading-shell")).toBeInTheDocument();
    expect(screen.getAllByTestId("settings-loading-line").length).toBeGreaterThan(2);
  });
});
