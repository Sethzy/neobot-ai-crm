/**
 * Tests for chat route page wiring.
 * @module app/(dashboard)/chat/page.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ChatPage from "./page";

vi.mock("@/components/chat/chat-panel", () => ({
  ChatPanel: ({ chatId }: { chatId: string }) => <div data-testid="chat-panel">{chatId}</div>,
}));

vi.mock("@/contexts/thread-context", () => ({
  useThreads: () => ({
    activeThreadId: "thread-active-1",
  }),
}));

describe("/chat page", () => {
  it("renders ChatPanel with active thread id", () => {
    render(<ChatPage />);

    expect(screen.getByTestId("chat-panel")).toHaveTextContent("thread-active-1");
  });
});
