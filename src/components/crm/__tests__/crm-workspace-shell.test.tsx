/**
 * Tests for the shared CRM workspace responsive toolbar.
 * @module components/crm/__tests__/crm-workspace-shell
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CrmWorkspaceShell } from "../crm-workspace-shell";

vi.mock("@/hooks/use-crm-views", () => ({
  useCrmViews: () => ({ data: [] }),
}));

describe("CrmWorkspaceShell", () => {
  it("renders the CRM toolbar as a mobile-first control stack", () => {
    render(
      <CrmWorkspaceShell
        activeViewId={null}
        count={12}
        entityType="contacts"
        onViewChange={vi.fn()}
        onViewTypeChange={vi.fn()}
        onSearchChange={vi.fn()}
        searchValue=""
        searchPlaceholder="Search people"
        title="People"
        viewContent={<div>Rows</div>}
        viewType="table"
        views={["table", "kanban"]}
      />,
    );

    expect(screen.getByTestId("crm-toolbar-stack")).toHaveClass("grid");
    expect(screen.getByPlaceholderText("Search people")).toHaveClass("h-11");
  });
});
