/**
 * Integration test for tasks page rendering with real CRM tasks table.
 * @module app/(dashboard)/tasks/__tests__/page.integration
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TasksPage from "../page";

vi.mock("@/hooks/use-crm-tasks", () => ({
  useCrmTasks: vi.fn(),
}));

vi.mock("@/hooks/use-record-drawer", () => ({
  useRecordDrawer: () => ({
    isOpen: false,
    recordId: null,
    open: vi.fn(),
    close: vi.fn(),
  }),
}));

describe("TasksPage integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders task rows via CrmTasksTable when data exists", async () => {
    const { useCrmTasks } = await import("@/hooks/use-crm-tasks");

    vi.mocked(useCrmTasks).mockReturnValue({
      data: [
        {
          task_id: "t-1",
          client_id: "cl-1",
          contact_id: "c-1",
          deal_id: "d-1",
          title: "Follow up with John",
          description: null,
          status: "open",
          due_date: "2026-03-05T00:00:00+08:00",
          created_at: "2026-03-01T00:00:00+08:00",
          updated_at: "2026-03-01T00:00:00+08:00",
          contacts: { first_name: "John", last_name: "Smith" },
          deals: { address: "123 Orchard Road" },
        },
      ],
      isLoading: false,
      isError: false,
    } as never);

    render(<TasksPage />);

    expect(screen.getByText("Follow up with John")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("123 Orchard Road")).toBeInTheDocument();
  });
});
