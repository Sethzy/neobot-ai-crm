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

    expect(screen.getByRole("button", { name: /table/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /board/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /calendar/i })).toBeInTheDocument();
  });

  it("marks the active view", () => {
    render(
      <ViewToggle
        current="kanban"
        views={["table", "kanban", "calendar"]}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("button", { name: /board/i })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByRole("button", { name: /table/i })).toHaveAttribute(
      "data-active",
      "false",
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

    await user.click(screen.getByRole("button", { name: /calendar/i }));

    expect(onChange).toHaveBeenCalledWith("calendar");
  });
});
