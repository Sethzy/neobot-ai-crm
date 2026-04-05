/**
 * Tests CRM list view toggle affordance behavior.
 * @module components/crm/__tests__/view-toggle
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ViewToggle } from "@/components/crm/view-toggle";

describe("ViewToggle", () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders labelled buttons for table, board, and calendar", () => {
    render(
      <ViewToggle
        current="table"
        views={["table", "kanban", "calendar"]}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("radio", { name: /table view/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /board view/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /calendar view/i })).toBeInTheDocument();
  });

  it("marks the active view", () => {
    render(
      <ViewToggle
        current="kanban"
        views={["table", "kanban", "calendar"]}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("radio", { name: /board view/i })).toHaveAttribute(
      "data-state",
      "on",
    );
    expect(screen.getByRole("radio", { name: /table view/i })).toHaveAttribute(
      "data-state",
      "off",
    );
  });

  it("calls onChange when clicking a different view", async () => {
    const user = userEvent.setup();

    render(
      <ViewToggle
        current="table"
        views={["table", "kanban", "calendar"]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("radio", { name: /calendar view/i }));

    expect(onChange).toHaveBeenCalledWith("calendar");
  });
});
