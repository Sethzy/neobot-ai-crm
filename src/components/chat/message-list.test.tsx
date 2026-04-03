/**
 * Tests for chat message list rendering.
 * @module components/chat/message-list.test
 */
import type React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
  MessageAction: ({ children, label, onClick, ...props }: { children: React.ReactNode; label?: string; onClick?: () => void; tooltip?: string }) => (
    <button data-testid="message-action" aria-label={label} onClick={onClick} type="button" {...props}>{children}</button>
  ),
  MessageActions: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="message-actions">{children}</div>
  ),
  MessageToolbar: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="message-toolbar">{children}</div>
  ),
}));

vi.mock("@/components/ai-elements/reasoning", () => ({
  Reasoning: ({ children, isStreaming }: { children: React.ReactNode; isStreaming?: boolean }) => (
    <div data-testid="reasoning-block" data-streaming={isStreaming}>{children}</div>
  ),
  ReasoningTrigger: () => <div data-testid="reasoning-trigger" />,
  ReasoningContent: ({ children }: { children: string }) => (
    <div data-testid="reasoning-content">{children}</div>
  ),
}));

vi.mock("@/components/ai-elements/shimmer", () => ({
  Shimmer: ({ children, className }: { children: string; className?: string }) => (
    <span data-testid="shimmer" className={className}>{children}</span>
  ),
}));

vi.mock("./tool-call-inline", () => ({
  ToolCallInline: ({ name, onToolApproval }: { name: string; onToolApproval?: unknown }) => (
    <div data-testid="tool-call-inline" data-has-approval={!!onToolApproval}>{name}</div>
  ),
}));

vi.mock("./ask-user-question-inline", () => ({
  AskUserQuestionInline: ({ questions, disabled }: {
    questions: Array<{ question: string }>;
    onSubmit: (text: string) => void;
    disabled?: boolean;
  }) => (
    <div
      data-testid="ask-user-question-inline"
      data-question-count={questions.length}
      data-disabled={!!disabled}
    />
  ),
}));

vi.mock("@/components/ai-elements/conversation", () => ({
  Conversation: ({ children, className, ...props }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="conversation" className={className} {...props}>{children}</div>
  ),
  ConversationContent: ({ children, className, ...props }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="message-scroll-container" className={className} {...props}>{children}</div>
  ),
  ConversationScrollButton: () => (
    <button data-testid="scroll-to-bottom" aria-label="Scroll to bottom" type="button" />
  ),
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

  it("keeps the scroll container mounted even with no messages", () => {
    render(<MessageList messages={[]} status="ready" />);

    expect(screen.getByTestId("message-scroll-container")).toBeInTheDocument();
  });

  it("renders message bubbles when messages exist", () => {
    render(<MessageList messages={[userMessage, assistantMessage]} status="ready" />);

    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("Hi there!")).toBeInTheDocument();
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

    expect(screen.getByTestId("reasoning-block")).toHaveAttribute("data-streaming", "true");
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

    expect(screen.getByTestId("reasoning-block")).toHaveAttribute("data-streaming", "false");
  });

  it("shows thinking shimmer inside a MessageBubble when status is submitted", () => {
    render(<MessageList messages={[userMessage]} status="submitted" />);

    // "Thinking..." should render via a placeholder MessageBubble (inside ai-message wrapper),
    // not as a standalone shimmer sibling — this prevents vertical position shift on transition.
    const shimmer = screen.getByTestId("shimmer");
    expect(shimmer).toBeInTheDocument();
    expect(shimmer).toHaveTextContent("Thinking...");

    // Verify it's inside the assistant message wrapper (MessageBubble path)
    const messageBubbles = screen.getAllByTestId("message-bubble");
    const placeholderBubble = messageBubbles.find((el) => el.querySelector("[data-testid='shimmer']"));
    expect(placeholderBubble).toBeDefined();
  });

  it("does not render placeholder bubble when status is streaming", () => {
    render(<MessageList messages={[userMessage, assistantMessage]} status="streaming" />);

    // No standalone shimmer — assistant message renders normally
    expect(screen.queryByTestId("shimmer")).not.toBeInTheDocument();
  });

  it("does not render placeholder bubble when status is ready", () => {
    render(<MessageList messages={[userMessage]} status="ready" />);

    // Only the user message bubble, no placeholder
    const messageBubbles = screen.getAllByTestId("message-bubble");
    expect(messageBubbles).toHaveLength(1);
  });

  it("forwards onToolApproval through to MessageBubble", () => {
    const onToolApproval = vi.fn();
    const withTool = {
      id: "2",
      role: "assistant" as const,
      parts: [
        { type: "tool-run_sql" as const, toolCallId: "tc1", state: "output-available" as const, input: {}, output: {} },
        { type: "text" as const, text: "Answer." },
      ],
    };
    render(<MessageList messages={[userMessage, withTool]} status="ready" onToolApproval={onToolApproval} />);

    expect(screen.getByTestId("tool-call-inline")).toHaveAttribute("data-has-approval", "true");
  });

  it("composes ConversationScrollButton inside Conversation", () => {
    render(<MessageList messages={[userMessage, assistantMessage]} status="ready" />);

    const conversation = screen.getByTestId("conversation");
    const scrollButton = screen.getByTestId("scroll-to-bottom");
    // Scroll button is a child of the Conversation container (not a sibling)
    expect(conversation.contains(scrollButton)).toBe(true);
  });

  it("does not render template cards — those live in ChatWelcome", () => {
    render(<MessageList messages={[]} status="ready" />);

    expect(screen.queryByText("Morning briefing")).not.toBeInTheDocument();
  });

  it("forwards onQuestionSubmit to the last assistant message only", () => {
    const askMessage = {
      id: "3",
      role: "assistant" as const,
      parts: [
        {
          type: "tool-ask_user_question" as const,
          toolCallId: "tc-ask-1",
          state: "output-available" as const,
          input: { questions: [{ question: "Pick one?", header: "Pick", options: [], multiSelect: false }] },
          output: { questions: [{ question: "Pick one?", header: "Pick", options: [], multiSelect: false }], status: "awaiting_response" },
        },
        { type: "text" as const, text: "Choose:" },
      ],
    };

    render(
      <MessageList
        messages={[userMessage, assistantMessage, askMessage]}
        status="ready"
        onQuestionSubmit={vi.fn()}
      />,
    );

    // The ask_user_question inline should render and be interactive (not disabled)
    // because it's in the last assistant message
    const inline = screen.getByTestId("ask-user-question-inline");
    expect(inline).toBeInTheDocument();
    expect(inline).toHaveAttribute("data-disabled", "false");
  });

  it("renders ask_user_question as disabled for non-last assistant messages", () => {
    const askMessage = {
      id: "2",
      role: "assistant" as const,
      parts: [
        {
          type: "tool-ask_user_question" as const,
          toolCallId: "tc-ask-1",
          state: "output-available" as const,
          input: { questions: [{ question: "Pick one?", header: "Pick", options: [], multiSelect: false }] },
          output: { questions: [{ question: "Pick one?", header: "Pick", options: [], multiSelect: false }], status: "awaiting_response" },
        },
        { type: "text" as const, text: "Choose:" },
      ],
    };

    const followUpUser = {
      id: "3",
      role: "user" as const,
      parts: [{ type: "text" as const, text: "Option A" }],
    };

    render(
      <MessageList
        messages={[userMessage, askMessage, followUpUser]}
        status="ready"
        onQuestionSubmit={vi.fn()}
      />,
    );

    // The ask_user_question inline should be disabled because it's not the last message
    const inline = screen.getByTestId("ask-user-question-inline");
    expect(inline).toHaveAttribute("data-disabled", "true");
  });
});
