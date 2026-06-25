/**
 * Tests the CRM tasks month-grid calendar.
 * @module components/crm/__tests__/crm-tasks-calendar
 */
import type { ReactNode } from "react";

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CrmTasksCalendar } from "@/components/crm/crm-tasks-calendar";

const { mockToastError } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: mockToastError,
  },
}));

interface MockDragEvent {
  active: {
    id: string;
    data: {
      current?: {
        dateKey?: string;
      };
    };
  };
  over: {
    id: string;
  } | null;
}

interface MockDndContextProps {
  children?: ReactNode;
  onDragCancel?: () => void;
  onDragEnd?: (event: MockDragEvent) => void | Promise<void>;
  onDragStart?: (event: Pick<MockDragEvent, "active">) => void;
}

let latestDndContextProps: MockDndContextProps | null = null;

vi.mock("@dnd-kit/core", async () => {
  const React = await import("react");

  return {
    DndContext: ({ children, ...props }: MockDndContextProps) => {
      latestDndContextProps = props;
      return React.createElement(React.Fragment, null, children);
    },
    DragOverlay: ({ children }: { children?: ReactNode }) =>
      React.createElement("div", { "data-testid": "calendar-drag-overlay" }, children),
    PointerSensor: class PointerSensor {},
    closestCenter: vi.fn(),
    useDraggable: ({ id }: { id: string }) => ({
      attributes: {
        role: "button",
        tabIndex: 0,
        "aria-roledescription": "draggable",
        "aria-describedby": `dnd-description-${id}`,
      },
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

const tasks = [
  {
    task_id: "task-1",
    client_id: "client-1",
    contact_id: "contact-1",
    deal_id: "deal-1",
    title: "Follow up with John",
    description: null,
    status: "todo" as const,
    due_date: "2026-03-05T00:00:00+08:00",
    custom_fields: {},
    created_at: "2026-03-01T00:00:00+08:00",
    updated_at: "2026-03-01T00:00:00+08:00",
    contacts: { first_name: "John", last_name: "Smith" },
    deals: { address: "123 Orchard Road" },
  },
  {
    task_id: "task-2",
    client_id: "client-1",
    contact_id: null,
    deal_id: null,
    title: "Prepare viewing notes",
    description: null,
    status: "done" as const,
    due_date: "2026-03-08T15:30:00+08:00",
    custom_fields: {},
    created_at: "2026-03-01T00:00:00+08:00",
    updated_at: "2026-03-01T00:00:00+08:00",
    contacts: null,
    deals: null,
  },
];

describe("CrmTasksCalendar", () => {
  beforeEach(() => {
    latestDndContextProps = null;
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-02T09:00:00+08:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a month grid with task cards for the selected month", () => {
    render(<CrmTasksCalendar tasks={tasks} />);

    expect(screen.getByText("March 2026")).toBeInTheDocument();
    expect(screen.getByText("Scheduled tasks")).toBeInTheDocument();
    expect(screen.getByText("Follow up with John")).toBeInTheDocument();
    expect(screen.getByText("Prepare viewing notes")).toBeInTheDocument();
    expect(screen.getByText("2 tasks scheduled this month.")).toBeInTheDocument();
  });

  it("shows an overflow indicator when a day has more than five tasks", () => {
    const crowdedTasks = Array.from({ length: 6 }, (_, index) => ({
      ...tasks[0],
      task_id: `overflow-${index}`,
      title: `Overflow task ${index + 1}`,
    }));

    render(<CrmTasksCalendar tasks={crowdedTasks} />);

    expect(screen.getByText("+1 more")).toBeInTheDocument();
  });

  it("keeps compact card metadata on one line", () => {
    render(
      <CrmTasksCalendar
        tasks={[
          {
            ...tasks[0],
            task_id: "compact-status",
            status: "in_progress",
            title: "Prepare diplomatic CMA for Michael",
            due_date: "2026-03-05T10:00:00+08:00",
          },
        ]}
      />,
    );

    expect(screen.getByText("In progress")).toHaveClass("whitespace-nowrap", "shrink-0");
    expect(screen.getByText(/\d{1,2}:00 AM/)).toHaveClass("truncate", "whitespace-nowrap");
  });

  it("keeps the empty-state copy tied to the selected month instead of padded adjacent weeks", () => {
    vi.setSystemTime(new Date("2026-04-15T09:00:00+08:00"));

    render(
      <CrmTasksCalendar
        tasks={[
          {
            ...tasks[0],
            task_id: "march-edge",
            due_date: "2026-03-30T00:00:00+08:00",
          },
          {
            ...tasks[1],
            task_id: "may-edge",
            due_date: "2026-05-01T15:30:00+08:00",
          },
        ]}
      />,
    );

    expect(screen.getByText("No tasks scheduled this month.")).toBeInTheDocument();
    expect(screen.getByText("Adjacent weeks show 2 tasks from neighboring months.")).toBeInTheDocument();
  });

  it("opens the task when a card is clicked", async () => {
    const onTaskClick = vi.fn();

    render(<CrmTasksCalendar onTaskClick={onTaskClick} tasks={tasks} />);

    fireEvent.click(screen.getByText("Follow up with John"));

    expect(onTaskClick).toHaveBeenCalledWith("task-1");
  });

  it("calls the due-date change handler when a task is dragged to another day", async () => {
    const onTaskDateChange = vi.fn().mockResolvedValue(undefined);

    render(<CrmTasksCalendar onTaskDateChange={onTaskDateChange} tasks={tasks} />);

    await act(async () => {
      await latestDndContextProps?.onDragEnd?.({
        active: {
          id: "task-2",
          data: { current: { dateKey: "2026-03-08" } },
        },
        over: { id: "2026-03-10" },
      });
    });

    expect(onTaskDateChange).toHaveBeenCalledWith("task-2", "2026-03-10T15:30:00+08:00");
  });

  it("does not call the reschedule handler when dropped onto the same date", async () => {
    const onTaskDateChange = vi.fn().mockResolvedValue(undefined);

    render(<CrmTasksCalendar onTaskDateChange={onTaskDateChange} tasks={tasks} />);

    await act(async () => {
      await latestDndContextProps?.onDragEnd?.({
        active: {
          id: "task-2",
          data: { current: { dateKey: "2026-03-08" } },
        },
        over: { id: "2026-03-08" },
      });
    });

    expect(onTaskDateChange).not.toHaveBeenCalled();
  });

  it("rolls the task back and shows an error when rescheduling fails", async () => {
    const onTaskDateChange = vi.fn().mockRejectedValue(new Error("failed"));

    render(<CrmTasksCalendar onTaskDateChange={onTaskDateChange} tasks={tasks} />);

    await act(async () => {
      await latestDndContextProps?.onDragEnd?.({
        active: {
          id: "task-2",
          data: { current: { dateKey: "2026-03-08" } },
        },
        over: { id: "2026-03-10" },
      });
    });

    expect(onTaskDateChange).toHaveBeenCalledWith("task-2", "2026-03-10T15:30:00+08:00");
    expect(mockToastError).toHaveBeenCalledWith("Unable to reschedule task.");
    expect(within(screen.getByTestId("calendar-day-2026-03-08")).getByText("Prepare viewing notes")).toBeInTheDocument();
    expect(within(screen.getByTestId("calendar-day-2026-03-10")).queryByText("Prepare viewing notes")).not.toBeInTheDocument();
  });
});
