/**
 * Focused regressions for long-thread chat rendering.
 * @module components/chat/__tests__/message-list
 */
import type React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MessageList } from "../message-list";

vi.mock("../message-bubble", () => ({
  MessageBubble: ({
    message,
  }: {
    message: { parts: Array<{ text?: string }> };
  }) => (
    <div data-testid="message-bubble">
      {message.parts[0]?.text ?? "message"}
    </div>
  ),
}));

vi.mock("use-stick-to-bottom", () => ({
  useStickToBottomContext: () => ({
    scrollToBottom: vi.fn(),
  }),
}));

vi.mock("@/components/ai-elements/conversation", () => ({
  Conversation: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ConversationContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ConversationScrollButton: () => <button type="button">Scroll</button>,
}));

describe("MessageList deferred rendering", () => {
  it("marks older messages as deferred rendering candidates", () => {
    const messages = Array.from({ length: 30 }, (_, index) => ({
      id: `msg-${index}`,
      role: index % 2 === 0 ? "user" as const : "assistant" as const,
      parts: [{ type: "text" as const, text: `message ${index}` }],
    }));

    render(<MessageList messages={messages} status="ready" />);

    expect(screen.getAllByTestId("chat-message-deferred")).toHaveLength(10);
  });
});
