/**
 * Tests for rendering one chat message bubble.
 * @module components/chat/message-bubble.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MessageBubble } from "./message-bubble";

vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => (
    <div data-testid="markdown-content">{children}</div>
  ),
}));

describe("MessageBubble", () => {
  it("renders user text content", () => {
    render(
      <MessageBubble
        message={{
          id: "1",
          role: "user",
          parts: [{ type: "text", text: "Hello agent" }],
        }}
      />,
    );

    expect(screen.getByText("Hello agent")).toBeInTheDocument();
  });

  it("renders assistant text through markdown", () => {
    render(
      <MessageBubble
        message={{
          id: "2",
          role: "assistant",
          parts: [{ type: "text", text: "**Hello**" }],
        }}
      />,
    );

    expect(screen.getByTestId("markdown-content")).toBeInTheDocument();
    expect(screen.getByText("**Hello**")).toBeInTheDocument();
  });

  it("applies role-based layout classes", () => {
    const { rerender } = render(
      <MessageBubble
        message={{ id: "1", role: "user", parts: [{ type: "text", text: "A" }] }}
      />,
    );

    expect(screen.getByTestId("message-bubble").className).toMatch(/justify-end/);

    rerender(
      <MessageBubble
        message={{ id: "2", role: "assistant", parts: [{ type: "text", text: "B" }] }}
      />,
    );

    expect(screen.getByTestId("message-bubble").className).toMatch(/justify-start/);
  });

  it("shows streaming indicator only for assistant while streaming", () => {
    const { rerender } = render(
      <MessageBubble
        message={{ id: "2", role: "assistant", parts: [{ type: "text", text: "B" }] }}
        isStreaming
      />,
    );

    expect(screen.getByTestId("streaming-indicator")).toBeInTheDocument();

    rerender(
      <MessageBubble
        message={{ id: "1", role: "user", parts: [{ type: "text", text: "A" }] }}
        isStreaming
      />,
    );

    expect(screen.queryByTestId("streaming-indicator")).not.toBeInTheDocument();
  });
});
