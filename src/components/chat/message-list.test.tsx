/**
 * Tests for chat message list rendering.
 * @module components/chat/message-list.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MessageList } from "./message-list";

vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

let isAtBottom = true;
const scrollToBottom = vi.fn();

vi.mock("@/hooks/use-scroll-to-bottom", () => ({
  useScrollToBottom: () => ({
    containerRef: { current: null },
    endRef: { current: null },
    isAtBottom,
    scrollToBottom,
  }),
}));

const userMessage = {
  id: "1",
  role: "user" as const,
  parts: [{ type: "text" as const, text: "Hello" }],
};

const assistantMessage = {
  id: "2",
  role: "assistant" as const,
  parts: [{ type: "text" as const, text: "Hi there!" }],
};

describe("MessageList", () => {
  it("renders empty state when there are no messages", () => {
    render(<MessageList messages={[]} status="ready" />);

    expect(screen.getByTestId("empty-chat")).toBeInTheDocument();
    expect(screen.getByText(/start a conversation/i)).toBeInTheDocument();
  });

  it("renders message bubbles when messages exist", () => {
    render(<MessageList messages={[userMessage, assistantMessage]} status="ready" />);

    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("Hi there!")).toBeInTheDocument();
    expect(screen.queryByTestId("empty-chat")).not.toBeInTheDocument();
  });

  it("marks the last assistant message as streaming when status is streaming", () => {
    render(<MessageList messages={[userMessage, assistantMessage]} status="streaming" />);

    expect(screen.getByTestId("streaming-indicator")).toBeInTheDocument();
  });

  it("hides streaming indicator when status is ready", () => {
    render(<MessageList messages={[userMessage, assistantMessage]} status="ready" />);

    expect(screen.queryByTestId("streaming-indicator")).not.toBeInTheDocument();
  });

  it("shows scroll button when user is not at bottom", () => {
    isAtBottom = false;

    render(<MessageList messages={[userMessage, assistantMessage]} status="ready" />);

    expect(screen.getByRole("button", { name: /scroll to bottom/i })).toBeInTheDocument();
  });
});
