/**
 * Tests generic CRM kanban board grouping and click behavior.
 * @module components/crm/__tests__/kanban-board
 */
import type { ReactNode } from "react";

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KanbanBoard } from "@/components/crm/kanban-board";

interface MockDragEvent {
  active: {
    id: string;
    data: {
      current?: {
        columnKey?: string;
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
      React.createElement("div", { "data-testid": "kanban-drag-overlay" }, children),
    PointerSensor: class PointerSensor {},
    closestCenter: vi.fn(),
    useDraggable: ({ id }: { id: string }) => ({
      active: null,
      activatorEvent: null,
      activeNodeRect: null,
      attributes: {
        role: "button",
        tabIndex: 0,
        "aria-disabled": false,
        "aria-pressed": undefined,
        "aria-roledescription": "draggable",
        "aria-describedby": `dnd-description-${id}`,
      },
      isDragging: false,
      listeners: {},
      node: { current: null },
      over: null,
      setActivatorNodeRef: () => {},
      setNodeRef: () => {},
      transform: null,
    }),
    useDroppable: () => ({
      active: null,
      rect: { current: null },
      isOver: false,
      node: { current: null },
      over: null,
      setNodeRef: () => {},
    }),
    useSensor: (sensor: unknown, options?: unknown) => ({ sensor, options }),
    useSensors: (...sensors: unknown[]) => sensors,
  };
});

const columns = [
  { key: "todo", label: "To do" },
  { key: "done", label: "Done" },
];

const items = [
  { id: "1", title: "Task A", status: "todo" },
  { id: "2", title: "Task B", status: "done" },
  { id: "3", title: "Task C", status: "todo" },
];

function getColumn(label: string) {
  const column = screen.getByText(label).closest("section");

  expect(column).not.toBeNull();

  return column as HTMLElement;
}

describe("KanbanBoard", () => {
  const onCardClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    latestDndContextProps = null;
  });

  it("renders column headers with counts", () => {
    render(
      <KanbanBoard
        items={items}
        columns={columns}
        groupBy={(item) => item.status}
        renderCard={(item) => <div>{item.title}</div>}
        onCardClick={onCardClick}
      />,
    );

    const todoColumn = screen.getByText("To do").closest("section");
    const doneColumn = screen.getByText("Done").closest("section");

    expect(todoColumn).not.toBeNull();
    expect(doneColumn).not.toBeNull();
    expect(within(todoColumn as HTMLElement).getByText("2")).toBeInTheDocument();
    expect(within(doneColumn as HTMLElement).getByText("1")).toBeInTheDocument();
  });

  it("renders cards in correct columns", () => {
    render(
      <KanbanBoard
        items={items}
        columns={columns}
        groupBy={(item) => item.status}
        renderCard={(item) => <div>{item.title}</div>}
        onCardClick={onCardClick}
      />,
    );

    expect(screen.getByText("Task A")).toBeInTheDocument();
    expect(screen.getByText("Task B")).toBeInTheDocument();
    expect(screen.getByText("Task C")).toBeInTheDocument();
  });

  it("calls onCardClick when a card is clicked", async () => {
    const user = userEvent.setup();

    render(
      <KanbanBoard
        items={items}
        columns={columns}
        groupBy={(item) => item.status}
        renderCard={(item) => <div>{item.title}</div>}
        onCardClick={onCardClick}
        getItemId={(item) => item.id}
      />,
    );

    await user.click(screen.getByText("Task A"));

    expect(onCardClick).toHaveBeenCalledWith("1");
  });

  it("shows zero count and empty state for empty columns", () => {
    render(
      <KanbanBoard
        items={[{ id: "1", title: "Task A", status: "todo" }]}
        columns={[...columns, { key: "blocked", label: "Blocked" }]}
        groupBy={(item) => item.status}
        renderCard={(item) => <div>{item.title}</div>}
        onCardClick={onCardClick}
      />,
    );

    const blockedColumn = screen.getByText("Blocked").closest("section");

    expect(blockedColumn).not.toBeNull();
    expect(within(blockedColumn as HTMLElement).getByText("0")).toBeInTheDocument();
    expect(within(blockedColumn as HTMLElement).getByText("No items yet.")).toBeInTheDocument();
  });

  it("renders board toolbar label and total item count when configured", () => {
    render(
      <KanbanBoard
        boardLabel="By Stage"
        items={items}
        columns={columns}
        groupBy={(item) => item.status}
        renderCard={(item) => <div>{item.title}</div>}
      />,
    );

    expect(screen.getByText("By Stage")).toBeInTheDocument();
    expect(screen.getByText(String(items.length))).toBeInTheDocument();
  });

  it("renders draggable cards when column changes are enabled", () => {
    render(
      <KanbanBoard
        items={items}
        columns={columns}
        groupBy={(item) => item.status}
        renderCard={(item) => <div>{item.title}</div>}
        getItemId={(item) => item.id}
        onColumnChange={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText("Task A").closest('[aria-roledescription="draggable"]')).toBeInTheDocument();
  });

  it("optimistically moves a card and calls onColumnChange on drag end", async () => {
    const onColumnChange = vi.fn<(...args: [string, string, string]) => Promise<void>>();
    let resolveMove!: () => void;

    onColumnChange.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMove = resolve;
        }),
    );

    render(
      <KanbanBoard
        items={items}
        columns={columns}
        groupBy={(item) => item.status}
        renderCard={(item) => <div>{item.title}</div>}
        getItemId={(item) => item.id}
        onColumnChange={onColumnChange}
      />,
    );

    await act(async () => {
      latestDndContextProps?.onDragStart?.({
        active: {
          id: "1",
          data: { current: { columnKey: "todo" } },
        },
      });
    });

    await act(async () => {
      void latestDndContextProps?.onDragEnd?.({
        active: {
          id: "1",
          data: { current: { columnKey: "todo" } },
        },
        over: { id: "done" },
      });
    });

    expect(onColumnChange).toHaveBeenCalledWith("1", "todo", "done");
    expect(within(getColumn("To do")).queryByText("Task A")).not.toBeInTheDocument();
    expect(within(getColumn("Done")).getByText("Task A")).toBeInTheDocument();

    await act(async () => {
      resolveMove();
    });
  });

  it("rolls a card back to its original column when the change fails", async () => {
    const onColumnChange = vi.fn<(...args: [string, string, string]) => Promise<void>>();
    let rejectMove!: (error?: unknown) => void;

    onColumnChange.mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          rejectMove = reject;
        }),
    );

    render(
      <KanbanBoard
        items={items}
        columns={columns}
        groupBy={(item) => item.status}
        renderCard={(item) => <div>{item.title}</div>}
        getItemId={(item) => item.id}
        onColumnChange={onColumnChange}
      />,
    );

    await act(async () => {
      latestDndContextProps?.onDragStart?.({
        active: {
          id: "1",
          data: { current: { columnKey: "todo" } },
        },
      });
    });

    await act(async () => {
      void latestDndContextProps?.onDragEnd?.({
        active: {
          id: "1",
          data: { current: { columnKey: "todo" } },
        },
        over: { id: "done" },
      });
    });

    expect(within(getColumn("Done")).getByText("Task A")).toBeInTheDocument();

    await act(async () => {
      rejectMove(new Error("Unable to update stage"));
    });

    await waitFor(() => {
      expect(within(getColumn("To do")).getByText("Task A")).toBeInTheDocument();
    });

    expect(within(getColumn("Done")).queryByText("Task A")).not.toBeInTheDocument();
  });

  it("still calls onCardClick when the user clicks without dragging", async () => {
    const user = userEvent.setup();

    render(
      <KanbanBoard
        items={items}
        columns={columns}
        groupBy={(item) => item.status}
        renderCard={(item) => <div>{item.title}</div>}
        getItemId={(item) => item.id}
        onCardClick={onCardClick}
        onColumnChange={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.click(screen.getByText("Task A"));

    expect(onCardClick).toHaveBeenCalledWith("1");
  });
});
