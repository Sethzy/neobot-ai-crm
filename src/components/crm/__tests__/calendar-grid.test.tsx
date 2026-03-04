/**
 * Tests read-only CRM calendar grid rendering and selection behavior.
 * @module components/crm/__tests__/calendar-grid
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarGrid } from "@/components/crm/calendar-grid";

const items = [
  { id: "1", title: "Task A", date: new Date(2026, 2, 10, 9, 0, 0) },
  { id: "2", title: "Task B", date: new Date(2026, 2, 10, 14, 0, 0) },
  { id: "3", title: "Task C", date: new Date(2026, 2, 15, 10, 0, 0) },
];

describe("CalendarGrid", () => {
  const onItemClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders month/year header", () => {
    render(
      <CalendarGrid
        items={items}
        getDate={(item) => item.date}
        getItemId={(item) => item.id}
        renderItem={(item) => <span>{item.title}</span>}
        initialMonth={new Date(2026, 2, 1)}
      />,
    );

    expect(screen.getByText(/March 2026/i)).toBeInTheDocument();
  });

  it("renders day-of-week headers", () => {
    render(
      <CalendarGrid
        items={items}
        getDate={(item) => item.date}
        getItemId={(item) => item.id}
        renderItem={(item) => <span>{item.title}</span>}
        initialMonth={new Date(2026, 2, 1)}
      />,
    );

    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Sun")).toBeInTheDocument();
  });

  it("shows day items when clicking a day with records", async () => {
    const user = userEvent.setup();

    render(
      <CalendarGrid
        items={items}
        getDate={(item) => item.date}
        getItemId={(item) => item.id}
        renderItem={(item) => <span>{item.title}</span>}
        initialMonth={new Date(2026, 2, 1)}
      />,
    );

    await user.click(screen.getByRole("button", { name: /10 March 2026/i }));

    expect(screen.getByText("Task A")).toBeInTheDocument();
    expect(screen.getByText("Task B")).toBeInTheDocument();
  });

  it("navigates to next month", async () => {
    const user = userEvent.setup();

    render(
      <CalendarGrid
        items={[]}
        getDate={() => new Date()}
        getItemId={() => ""}
        renderItem={() => null}
        initialMonth={new Date(2026, 2, 1)}
      />,
    );

    await user.click(screen.getByLabelText("Next month"));

    expect(screen.getByText(/April 2026/i)).toBeInTheDocument();
  });

  it("calls onItemClick when clicking an item in selected-day list", async () => {
    const user = userEvent.setup();

    render(
      <CalendarGrid
        items={items}
        getDate={(item) => item.date}
        getItemId={(item) => item.id}
        renderItem={(item) => <span>{item.title}</span>}
        initialMonth={new Date(2026, 2, 1)}
        onItemClick={onItemClick}
      />,
    );

    await user.click(screen.getByRole("button", { name: /10 March 2026/i }));
    await user.click(screen.getByRole("button", { name: /Task A/i }));

    expect(onItemClick).toHaveBeenCalledWith("1");
  });
});
