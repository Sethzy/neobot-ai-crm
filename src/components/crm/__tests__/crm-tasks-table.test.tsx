/**
 * Tests CRM task table inline edits.
 * @module components/crm/__tests__/crm-tasks-table
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CrmTasksTable } from "@/components/crm/crm-tasks-table";

const mockMutateAsync = vi.fn().mockResolvedValue(undefined);

vi.mock("@/hooks/use-update-crm-task", () => ({
  useUpdateCrmTask: vi.fn(() => ({
    mutateAsync: mockMutateAsync,
  })),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: vi.fn(() => false),
}));

if (!HTMLElement.prototype.hasPointerCapture) {
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
    configurable: true,
    value: () => false,
  });
}

if (!HTMLElement.prototype.setPointerCapture) {
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: () => undefined,
  });
}

if (!HTMLElement.prototype.releasePointerCapture) {
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    value: () => undefined,
  });
}

const tasks = [
  {
    task_id: "task-1",
    client_id: "client-1",
    contact_id: "contact-1",
    deal_id: "deal-1",
    title: "Follow up with John",
    description: null,
    status: "open" as const,
    due_date: "2026-03-05T00:00:00+08:00",
    created_at: "2026-03-01T00:00:00+08:00",
    updated_at: "2026-03-01T00:00:00+08:00",
    contacts: { first_name: "John", last_name: "Smith" },
    deals: { address: "123 Orchard Road" },
  },
];

describe("CrmTasksTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue(undefined);
  });

  it("updates task status without triggering the row click handler", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();

    render(<CrmTasksTable tasks={tasks} onRowClick={onRowClick} />);

    await user.click(screen.getByRole("button", { name: /edit status/i }));
    await user.click(screen.getByRole("combobox", { name: /status/i }));
    await user.click(await screen.findByRole("option", { name: /completed/i }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ status: "completed" });
    });
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("updates due dates from the table", async () => {
    const user = userEvent.setup();

    render(<CrmTasksTable tasks={tasks} />);

    await user.click(screen.getByRole("button", { name: /edit due date/i }));

    const dueDateInput = screen.getByLabelText(/due date/i);
    fireEvent.change(dueDateInput, { target: { value: "2026-03-10" } });
    fireEvent.keyDown(dueDateInput, { key: "Enter" });

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        due_date: expect.stringMatching(/^2026-03-10T00:00:00[+-]\d{2}:\d{2}$/),
      });
    });
  });
});
