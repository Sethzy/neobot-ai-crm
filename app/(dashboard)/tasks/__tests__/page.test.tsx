/**
 * Tests for Tasks page query states and search wiring.
 * @module app/(dashboard)/tasks/__tests__/page
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TasksPage from "../page";

vi.mock("@/hooks/use-crm-tasks", () => ({
  useCrmTasks: vi.fn(),
}));

vi.mock("@/components/crm/crm-tasks-table", () => ({
  CrmTasksTable: () => <div>CRM Tasks Table</div>,
}));

describe("TasksPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows error state and retries when tasks query fails", async () => {
    const { useCrmTasks } = await import("@/hooks/use-crm-tasks");
    const mockRefetch = vi.fn();

    vi.mocked(useCrmTasks).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    } as never);

    render(<TasksPage />);

    expect(screen.getByText(/unable to load tasks/i)).toBeInTheDocument();
    screen.getByRole("button", { name: /retry/i }).click();
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("passes trimmed search text into the tasks hook", async () => {
    const { useCrmTasks } = await import("@/hooks/use-crm-tasks");

    vi.mocked(useCrmTasks).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as never);

    const user = userEvent.setup();
    render(<TasksPage />);

    await user.type(screen.getByPlaceholderText(/search tasks/i), "  follow up  ");

    expect(vi.mocked(useCrmTasks)).toHaveBeenLastCalledWith({ search: "follow up" });
  });
});
