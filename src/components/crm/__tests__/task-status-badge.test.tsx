/**
 * Tests for CRM task status badge rendering.
 * @module components/crm/__tests__/task-status-badge
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TaskStatusBadge } from "../task-status-badge";

describe("TaskStatusBadge", () => {
  it("renders open status as outline badge", () => {
    const { container } = render(<TaskStatusBadge status="open" />);

    expect(screen.getByText("Open")).toBeInTheDocument();
    const badge = container.querySelector("[data-slot='badge']");
    expect(badge).toHaveAttribute("data-variant", "outline");
  });

  it("renders completed status as success badge", () => {
    const { container } = render(<TaskStatusBadge status="completed" />);

    expect(screen.getByText("Completed")).toBeInTheDocument();
    const badge = container.querySelector("[data-slot='badge']");
    expect(badge).toHaveAttribute("data-variant", "success");
  });
});
