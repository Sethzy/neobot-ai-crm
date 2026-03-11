/**
 * Tests for the TaskItem view component.
 * @module components/views/task-item.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/crm/task-status-badge", () => ({
  TaskStatusBadge: ({ status }: { status: string }) => (
    <span data-testid="task-status-badge">{status}</span>
  ),
}));

import { TaskItem } from "./task-item";

describe("TaskItem", () => {
  it("renders the task title", () => {
    render(<TaskItem title="Follow up with John" />);

    expect(screen.getByText("Follow up with John")).toBeInTheDocument();
  });

  it("renders the due date and status", () => {
    render(
      <TaskItem
        title="Call Sarah"
        dueDate="8 Mar 2026"
        status="open"
      />,
    );

    expect(screen.getByText("8 Mar 2026")).toBeInTheDocument();
    expect(screen.getByTestId("task-status-badge")).toHaveTextContent("open");
  });

  it("renders linked contact and deal context", () => {
    render(
      <TaskItem
        title="Schedule viewing"
        contactName="John Tan"
        dealAddress="Blk 322 Jurong"
      />,
    );

    expect(screen.getByText(/John Tan/)).toBeInTheDocument();
    expect(screen.getByText(/Blk 322 Jurong/)).toBeInTheDocument();
  });
});
