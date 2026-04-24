/**
 * Tests for the shared CRM list loading shell.
 * @module components/crm/__tests__/crm-list-loading-shell.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CrmListLoadingShell } from "../crm-list-loading-shell";

describe("CrmListLoadingShell", () => {
  it("renders a six-row crm table skeleton", () => {
    render(<CrmListLoadingShell title="Deals" />);

    expect(screen.getByText("Deals")).toBeInTheDocument();
    expect(screen.getAllByTestId("crm-loading-row")).toHaveLength(6);
  });
});
