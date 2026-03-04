/**
 * Tests CRM task drawer content rendering states.
 * @module components/crm/record-drawer/__tests__/task-drawer-content
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TaskDrawerContent } from "../task-drawer-content";

vi.mock("@/hooks/use-crm-tasks", () => ({
  useCrmTask: () => ({
    data: {
      task_id: "t-1",
      client_id: "cl-1",
      contact_id: "c-1",
      deal_id: "d-1",
      title: "Follow up with Sarah",
      description: "Call about Sunday viewing.",
      status: "open",
      due_date: "2026-03-10T00:00:00+08:00",
      created_at: "2026-03-01T00:00:00+08:00",
      updated_at: "2026-03-04T00:00:00+08:00",
      contacts: { first_name: "Sarah", last_name: "Tan" },
      deals: { address: "Bishan St 22" },
    },
    isLoading: false,
    isError: false,
  }),
}));

describe("TaskDrawerContent", () => {
  it("renders task title and status", () => {
    render(<TaskDrawerContent taskId="t-1" />);

    expect(screen.getByText("Follow up with Sarah")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("renders linked contact and deal", () => {
    render(<TaskDrawerContent taskId="t-1" />);

    expect(screen.getByText("Sarah Tan")).toBeInTheDocument();
    expect(screen.getByText("Bishan St 22")).toBeInTheDocument();
  });
});

