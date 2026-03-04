/**
 * Tests for CRM tasks table rendering and row click behavior.
 * @module components/crm/__tests__/crm-tasks-table
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CrmTasksTable } from "../crm-tasks-table";

const sampleTasks = [
  {
    task_id: "t-1",
    client_id: "cl-1",
    contact_id: "c-1",
    deal_id: "d-1",
    title: "Follow up with John",
    description: "Discuss next viewing date",
    status: "open" as const,
    due_date: "2026-03-05T00:00:00+08:00",
    created_at: "2026-03-01T00:00:00+08:00",
    updated_at: "2026-03-01T00:00:00+08:00",
    contacts: { first_name: "John", last_name: "Smith" },
    deals: { address: "123 Orchard Road" },
  },
  {
    task_id: "t-2",
    client_id: "cl-1",
    contact_id: null,
    deal_id: null,
    title: "Send OTP documents",
    description: null,
    status: "completed" as const,
    due_date: null,
    created_at: "2026-02-28T00:00:00+08:00",
    updated_at: "2026-03-01T00:00:00+08:00",
    contacts: null,
    deals: null,
  },
];

describe("CrmTasksTable", () => {
  it("renders task rows with status labels and linked entities", () => {
    render(<CrmTasksTable tasks={sampleTasks} />);

    expect(screen.getByText("Follow up with John")).toBeInTheDocument();
    expect(screen.getByText("Send OTP documents")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("123 Orchard Road")).toBeInTheDocument();
  });

  it("renders due date using CRM date format", () => {
    render(<CrmTasksTable tasks={sampleTasks} />);

    expect(screen.getByText(/5 Mar 2026/i)).toBeInTheDocument();
  });

  it("shows placeholders for null due date, contact, and deal", () => {
    render(<CrmTasksTable tasks={sampleTasks} />);

    const row = screen.getByText("Send OTP documents").closest("tr");
    expect(row).not.toBeNull();

    const placeholders = within(row as HTMLElement).getAllByText("—");
    expect(placeholders.length).toBeGreaterThanOrEqual(3);
  });

  it("renders empty state when no tasks are available", () => {
    render(<CrmTasksTable tasks={[]} />);

    expect(screen.getByText(/no tasks yet/i)).toBeInTheDocument();
  });

  it("calls onRowClick with task id when clicking a row", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(<CrmTasksTable tasks={sampleTasks} onRowClick={onRowClick} />);

    const targetRow = screen.getByText("Follow up with John").closest("tr");
    expect(targetRow).not.toBeNull();
    await user.click(targetRow as HTMLElement);

    expect(onRowClick).toHaveBeenCalledWith("t-1");
  });
});
