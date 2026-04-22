/**
 * Integration test for tasks page rendering with real CRM tasks table.
 * @module app/(dashboard)/tasks/__tests__/page.integration
 */
import type { ReactNode } from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TasksPage from "../page";

vi.mock("@dnd-kit/core", async () => {
  const React = await import("react");

  return {
    DndContext: ({ children }: { children?: ReactNode }) => React.createElement(React.Fragment, null, children),
    DragOverlay: ({ children }: { children?: ReactNode }) => React.createElement("div", null, children),
    PointerSensor: class PointerSensor {},
    closestCenter: vi.fn(),
    useDraggable: () => ({
      attributes: {},
      isDragging: false,
      listeners: {},
      setNodeRef: () => {},
      transform: null,
    }),
    useDroppable: () => ({
      isOver: false,
      setNodeRef: () => {},
    }),
    useSensor: (sensor: unknown, options?: unknown) => ({ sensor, options }),
    useSensors: (...sensors: unknown[]) => sensors,
  };
});

vi.mock("@/hooks/use-crm-tasks", () => ({
  useCrmTasks: vi.fn(),
  crmTaskKeys: { all: ["crm-tasks"] },
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
    useMutation: () => ({ mutateAsync: vi.fn() }),
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: { from: vi.fn() },
}));

vi.mock("@/hooks/use-update-crm-task", () => ({
  useUpdateCrmTask: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  })),
  useUpdateCrmTaskMutation: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@/hooks/use-record-drawer", () => ({
  useRecordDrawer: () => ({
    isOpen: false,
    recordId: null,
    open: vi.fn(),
    close: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-client-id", () => ({
  useClientId: () => ({
    data: "client-1",
  }),
}));

vi.mock("@/hooks/use-crm-views", () => ({
  useCrmViews: () => ({ data: [] }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("TasksPage integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-02T09:00:00+08:00"));
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders task rows via ListTable when data exists", async () => {
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
          status: "todo",
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
    expect(screen.getByText("To do")).toBeInTheDocument();
    expect(screen.getByText("John Smith")).toBeInTheDocument();
  });

  it("switches between table, board, and calendar views", async () => {
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
          status: "todo",
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
          title: "Prepare viewing notes",
          description: null,
          status: "done",
          due_date: "2026-03-08T00:00:00+08:00",
          created_at: "2026-03-01T00:00:00+08:00",
          updated_at: "2026-03-01T00:00:00+08:00",
          contacts: null,
          deals: null,
        },
      ],
      isLoading: false,
      isError: false,
    } as never);

    render(<TasksPage />);

    expect(screen.getByRole("radio", { name: "Table view" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Board view" }));
    expect(screen.getByText("By Status")).toBeInTheDocument();
    expect(screen.getAllByText("To do").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("radio", { name: "Calendar view" }));
    expect(screen.getByText(/scheduled tasks/i)).toBeInTheDocument();
    expect(screen.getByText("March 2026")).toBeInTheDocument();
    expect(screen.getByText("Follow up with John")).toBeInTheDocument();
  });
});
