/**
 * Tests for CRM task status badge rendering.
 * @module components/crm/__tests__/task-status-badge
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TaskStatusBadge } from "../task-status-badge";

describe("TaskStatusBadge", () => {
  it("renders todo status as outline badge", () => {
    const { container } = render(<TaskStatusBadge status="todo" />);

    expect(screen.getByText("To do")).toBeInTheDocument();
    const badge = container.querySelector("[data-slot='badge']");
    expect(badge).toHaveAttribute("data-variant", "outline");
  });

  it("renders in_progress status as secondary badge", () => {
    const { container } = render(<TaskStatusBadge status="in_progress" />);

    expect(screen.getByText("In progress")).toBeInTheDocument();
    const badge = container.querySelector("[data-slot='badge']");
    expect(badge).toHaveAttribute("data-variant", "secondary");
  });

  it("renders done status as success badge", () => {
    const { container } = render(<TaskStatusBadge status="done" />);

    expect(screen.getByText("Done")).toBeInTheDocument();
    const badge = container.querySelector("[data-slot='badge']");
    expect(badge).toHaveAttribute("data-variant", "success");
  });
});
