/**
 * Tests for thread rail sidebar list.
 * @module components/chat/thread-rail.test
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Thread } from "@/types/chat";

import { ThreadRail } from "./thread-rail";

vi.mock("@/components/ui/sidebar", () => ({
  SidebarMenuSub: ({ children }: React.PropsWithChildren) => <ul>{children}</ul>,
  SidebarMenuSubItem: ({ children }: React.PropsWithChildren) => <li>{children}</li>,
  SidebarMenuSubButton: ({
    children,
    isActive,
    ...props
  }: React.PropsWithChildren<{ isActive?: boolean } & Record<string, unknown>>) => (
    <button data-active={isActive} {...props}>
      {children}
    </button>
  ),
}));

const threads: Thread[] = [
  { id: "thread-1", title: "First Chat", createdAt: new Date("2026-03-01T10:00:00.000Z") },
  { id: "thread-2", title: "Second Chat", createdAt: new Date("2026-03-01T11:00:00.000Z") },
];

describe("ThreadRail", () => {
  const props = {
    threads,
    activeThreadId: "thread-1",
    onSelectThread: vi.fn(),
    onNewThread: vi.fn(),
  };

  it("renders threads and the new chat action", () => {
    render(<ThreadRail {...props} />);

    expect(screen.getByText("First Chat")).toBeInTheDocument();
    expect(screen.getByText("Second Chat")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new chat/i })).toBeInTheDocument();
  });

  it("calls onNewThread when new chat is clicked", async () => {
    const onNewThread = vi.fn();
    const user = userEvent.setup();

    render(<ThreadRail {...props} onNewThread={onNewThread} />);
    await user.click(screen.getByRole("button", { name: /new chat/i }));

    expect(onNewThread).toHaveBeenCalledTimes(1);
  });

  it("calls onSelectThread when a thread is clicked", async () => {
    const onSelectThread = vi.fn();
    const user = userEvent.setup();

    render(<ThreadRail {...props} onSelectThread={onSelectThread} />);
    await user.click(screen.getByText("Second Chat"));

    expect(onSelectThread).toHaveBeenCalledWith("thread-2");
  });

  it("marks active thread", () => {
    render(<ThreadRail {...props} activeThreadId="thread-1" />);

    expect(screen.getByText("First Chat").closest("button")).toHaveAttribute("data-active", "true");
    expect(screen.getByText("Second Chat").closest("button")).toHaveAttribute("data-active", "false");
  });
});
