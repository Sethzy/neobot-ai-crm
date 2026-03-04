/**
 * Tests generic CRM kanban board grouping and click behavior.
 * @module components/crm/__tests__/kanban-board
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KanbanBoard } from "@/components/crm/kanban-board";

const columns = [
  { key: "open", label: "Open" },
  { key: "completed", label: "Completed" },
];

const items = [
  { id: "1", title: "Task A", status: "open" },
  { id: "2", title: "Task B", status: "completed" },
  { id: "3", title: "Task C", status: "open" },
];

describe("KanbanBoard", () => {
  const onCardClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
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

    const openColumn = screen.getByText("Open").closest("section");
    const completedColumn = screen.getByText("Completed").closest("section");

    expect(openColumn).not.toBeNull();
    expect(completedColumn).not.toBeNull();
    expect(within(openColumn as HTMLElement).getByText("2")).toBeInTheDocument();
    expect(within(completedColumn as HTMLElement).getByText("1")).toBeInTheDocument();
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
        items={[{ id: "1", title: "Task A", status: "open" }]}
        columns={[...columns, { key: "blocked", label: "Blocked" }]}
        groupBy={(item) => item.status}
        renderCard={(item) => <div>{item.title}</div>}
        onCardClick={onCardClick}
      />,
    );

    const blockedColumn = screen.getByText("Blocked").closest("section");

    expect(blockedColumn).not.toBeNull();
    expect(within(blockedColumn as HTMLElement).getByText("0")).toBeInTheDocument();
    expect(within(blockedColumn as HTMLElement).getByText("No items")).toBeInTheDocument();
  });
});
