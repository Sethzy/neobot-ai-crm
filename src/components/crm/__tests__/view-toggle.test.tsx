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

  it("renders three buttons", () => {
    render(
      <ViewToggle current="table" views={["table", "kanban", "calendar"]} onChange={onChange} />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("marks the active view", () => {
    render(
      <ViewToggle current="kanban" views={["table", "kanban", "calendar"]} onChange={onChange} />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons[1]).toHaveAttribute("data-active", "true");
    expect(buttons[0]).toHaveAttribute("data-active", "false");
  });

  it("calls onChange when clicking a different view", async () => {
    const user = userEvent.setup();

    render(
      <ViewToggle current="table" views={["table", "kanban", "calendar"]} onChange={onChange} />,
    );

    const buttons = screen.getAllByRole("button");
    await user.click(buttons[2]);

    expect(onChange).toHaveBeenCalledWith("calendar");
  });
});
