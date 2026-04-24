/**
 * Tests for the tasks route loading shell.
 * @module components/crm/__tests__/tasks-page-loading.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TasksPageLoading } from "@/components/tasks/tasks-page-loading";

describe("TasksPageLoading", () => {
  it("renders the tasks toolbar and row placeholders", () => {
    render(<TasksPageLoading />);

    expect(screen.getByText("Todos")).toBeInTheDocument();
    expect(screen.getAllByTestId("tasks-loading-row")).toHaveLength(6);
  });
});
