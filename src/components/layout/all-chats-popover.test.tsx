/**
 * Tests unread rendering in the All chats popover.
 * @module components/layout/all-chats-popover.test
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AllChatsPopover } from "./all-chats-popover";

vi.mock("@/contexts/thread-context", () => ({
  useThreads: () => ({
    threads: [
      {
        id: "thread-1",
        title: "Thread Alpha",
        isPinned: false,
        isPrimary: false,
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-04-22T10:00:00.000Z"),
        lastReadAt: null,
        isUnread: true,
        sourceType: "chat",
      },
    ],
  }),
}));

describe("AllChatsPopover", () => {
  it("renders unread dot and bold title for unread threads", async () => {
    const user = userEvent.setup();

    render(
      <AllChatsPopover pathname="/chat" onNavigate={vi.fn()}>
        <button type="button">All chats</button>
      </AllChatsPopover>,
    );

    await user.click(screen.getByRole("button", { name: "All chats" }));

    const threadLink = await screen.findByRole("link", { name: /thread alpha/i });
    expect(within(threadLink).getByTestId("thread-unread-dot")).toBeInTheDocument();
    expect(within(threadLink).getByText("Thread Alpha")).toHaveClass("font-semibold");
  });

  it("suppresses the unread dot on the active thread row", async () => {
    const user = userEvent.setup();

    render(
      <AllChatsPopover pathname="/chat/thread-1" onNavigate={vi.fn()}>
        <button type="button">All chats</button>
      </AllChatsPopover>,
    );

    await user.click(screen.getByRole("button", { name: "All chats" }));

    const threadLink = await screen.findByRole("link", { name: /thread alpha/i });
    expect(within(threadLink).queryByTestId("thread-unread-dot")).not.toBeInTheDocument();
  });
});
