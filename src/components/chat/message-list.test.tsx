/**
 * Tests for chat message list rendering.
 * @module components/chat/message-list.test
 */
import type React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MessageList } from "./message-list";

/* ------------------------------------------------------------------ */
/*  Mocks                                                             */
/* ------------------------------------------------------------------ */

vi.mock("@/components/ai-elements/message", () => ({
  Message: ({ children, from, ...props }: { children: React.ReactNode; from: string }) => (
    <div data-testid="ai-message" data-from={from} {...props}>{children}</div>
  ),
  MessageContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="ai-message-content">{children}</div>
  ),
  MessageResponse: ({ children }: { children: string }) => (
    <div data-testid="message-response">{children}</div>
  ),
}));

vi.mock("@/components/ai-elements/shimmer", () => ({
  Shimmer: ({ children, className }: { children: string; className?: string }) => (
    <span data-testid="shimmer" className={className}>{children}</span>
  ),
}));

vi.mock("./tool-call-inline", () => ({
  ToolCallInline: ({ name }: { name: string }) => (
    <div data-testid="tool-call-inline">{name}</div>
  ),
}));

vi.mock("./steps-summary", () => ({
  StepsSummary: ({ isStreaming, onToolApproval }: { parts: Array<{ type: string }>; isStreaming: boolean; hasTextParts: boolean; messageId: string; onToolApproval?: unknown }) => (
    <div data-testid="steps-summary" data-streaming={isStreaming} data-has-approval={!!onToolApproval} />
  ),
}));

let isAtBottom = true;
const scrollToBottom = vi.fn();

vi.mock("@/lib/automations/templates", () => ({
  AUTOMATION_TEMPLATES: [
    { id: "t1", title: "Morning briefing", description: "Daily summary", category: "sales", prompt: "Set up morning briefing" },
    { id: "t2", title: "Follow-up sweep", description: "Check stale leads", category: "sales", prompt: "Set up follow-up sweep" },
    { id: "t3", title: "Pipeline summary", description: "Weekly recap", category: "sales", prompt: "Set up pipeline summary" },
    { id: "t4", title: "Listing monitor", description: "Watch feeds", category: "research", prompt: "Set up listing monitor" },
  ],
}));

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
  beforeEach(() => {
    isAtBottom = true;
  });

  it("keeps the scroll container mounted for empty-state transitions", () => {
    render(<MessageList messages={[]} status="ready" />);

    expect(screen.getByTestId("message-scroll-container")).toBeInTheDocument();
    expect(screen.getByTestId("empty-chat")).toBeInTheDocument();
  });

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
    const streamingAssistant = {
      id: "2",
      role: "assistant" as const,
      parts: [
        { type: "reasoning" as const, text: "Thinking..." },
        { type: "text" as const, text: "Hi there!" },
      ],
    };
    render(<MessageList messages={[userMessage, streamingAssistant]} status="streaming" />);

    expect(screen.getByTestId("steps-summary")).toHaveAttribute("data-streaming", "true");
  });

  it("does not mark messages as streaming when status is ready", () => {
    const withReasoning = {
      id: "2",
      role: "assistant" as const,
      parts: [
        { type: "reasoning" as const, text: "Thinking..." },
        { type: "text" as const, text: "Hi there!" },
      ],
    };
    render(<MessageList messages={[userMessage, withReasoning]} status="ready" />);

    expect(screen.getByTestId("steps-summary")).toHaveAttribute("data-streaming", "false");
  });

  it("shows thinking shimmer when status is submitted", () => {
    render(<MessageList messages={[userMessage]} status="submitted" />);

    expect(screen.getByTestId("shimmer")).toBeInTheDocument();
    expect(screen.getByText("Thinking...")).toBeInTheDocument();
  });

  it("hides thinking shimmer when status is streaming", () => {
    render(<MessageList messages={[userMessage, assistantMessage]} status="streaming" />);

    expect(screen.queryByTestId("shimmer")).not.toBeInTheDocument();
  });

  it("forwards onToolApproval through to MessageBubble", () => {
    const onToolApproval = vi.fn();
    const withReasoning = {
      id: "2",
      role: "assistant" as const,
      parts: [
        { type: "reasoning" as const, text: "Thinking..." },
        { type: "text" as const, text: "Answer." },
      ],
    };
    render(<MessageList messages={[userMessage, withReasoning]} status="ready" onToolApproval={onToolApproval} />);

    expect(screen.getByTestId("steps-summary")).toHaveAttribute("data-has-approval", "true");
  });

  it("shows scroll button when user is not at bottom", () => {
    isAtBottom = false;

    render(<MessageList messages={[userMessage, assistantMessage]} status="ready" />);

    expect(screen.getByRole("button", { name: /scroll to bottom/i })).toBeInTheDocument();
  });

  it("renders suggestion chips in empty state", () => {
    const onSuggestionClick = vi.fn();
    render(<MessageList messages={[]} status="ready" onSuggestionClick={onSuggestionClick} />);

    expect(screen.getByText("Morning briefing")).toBeInTheDocument();
    expect(screen.getByText("Follow-up sweep")).toBeInTheDocument();
    expect(screen.getByText("Pipeline summary")).toBeInTheDocument();
  });

  it("calls onSuggestionClick with the template prompt when a chip is clicked", async () => {
    const user = userEvent.setup();
    const onSuggestionClick = vi.fn();
    render(<MessageList messages={[]} status="ready" onSuggestionClick={onSuggestionClick} />);

    await user.click(screen.getByText("Morning briefing"));

    expect(onSuggestionClick).toHaveBeenCalledWith("Set up morning briefing");
  });

  it("does not render suggestion chips when messages exist", () => {
    const onSuggestionClick = vi.fn();
    render(
      <MessageList
        messages={[userMessage]}
        status="ready"
        onSuggestionClick={onSuggestionClick}
      />,
    );

    expect(screen.queryByText("Morning briefing")).not.toBeInTheDocument();
  });
});
