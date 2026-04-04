/**
 * Tests CRM task drawer content rendering states.
 * @module components/crm/record-drawer/__tests__/task-drawer-content
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
      status: "todo",
      due_date: "2026-03-10T00:00:00+08:00",
      custom_fields: { priority_note: "Call after 6pm" },
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

vi.mock("@/hooks/use-crm-config", () => ({
  useCrmConfig: () => ({
    data: {
      config: {
        deal_label: "Policy",
        deal_stages: ["lead", "quoted", "bound"],
        contact_types: ["prospect", "client"],
        interaction_types: ["call", "email"],
        deal_contact_roles: ["insured", "owner"],
        deal_custom_fields: [],
        contact_custom_fields: [],
        task_custom_fields: [
          { key: "priority_note", label: "Priority Note", type: "text", required: false },
        ],
      },
    },
  }),
}));

vi.mock("@/components/crm/inline-edit-field", () => ({
  InlineEditField: (props: { label: string; value: string | null; type?: string }) => inlineFieldSpy(props),
}));

describe("TaskDrawerContent", () => {
  beforeEach(() => {
    inlineFieldSpy.mockClear();
  });

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
    expect(screen.getByText("To do")).toBeInTheDocument();
  });

  it("renders linked contact and deal", () => {
    render(<TaskDrawerContent taskId="t-1" />);

    expect(screen.getByText("Sarah Tan")).toBeInTheDocument();
    expect(screen.getByText("Bishan St 22")).toBeInTheDocument();
  });

  it("renders task custom fields from the CRM config", () => {
    render(<TaskDrawerContent taskId="t-1" />);

    expect(screen.getByTestId("inline-Priority Note")).toBeInTheDocument();

    const customFieldCall = inlineFieldSpy.mock.calls.find(([props]) => props.label === "Priority Note")?.[0];
    expect(customFieldCall).toMatchObject({
      value: "Call after 6pm",
      type: "text",
    });
  });
});
