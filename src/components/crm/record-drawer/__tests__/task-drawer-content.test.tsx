/**
 * Tests CRM task drawer content rendering states.
 * @module components/crm/record-drawer/__tests__/task-drawer-content
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TaskDrawerContent } from "../task-drawer-content";

const inlineFieldSpy = vi.fn(
  ({ label, value, type }: { label: string; value: string | null; type?: string }) => (
    <div data-testid={`inline-${label}`}>
      {label}:{value ?? "—"}:{type ?? "text"}
    </div>
  ),
);

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

vi.mock("@/hooks/use-update-crm-task", () => ({
  useUpdateCrmTask: () => ({
    mutateAsync: vi.fn(),
  }),
}));

vi.mock("@/components/crm/inline-edit-field", () => ({
  InlineEditField: (props: { label: string; value: string | null; type?: string }) => inlineFieldSpy(props),
}));

describe("TaskDrawerContent", () => {
  it("renders inline-edit fields for editable task details", () => {
    render(<TaskDrawerContent taskId="t-1" />);

    expect(screen.getByTestId("inline-Title")).toBeInTheDocument();
    expect(screen.getByTestId("inline-Status")).toBeInTheDocument();
    expect(screen.getByTestId("inline-Due Date")).toBeInTheDocument();
    expect(screen.getByTestId("inline-Description")).toBeInTheDocument();
  });

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
