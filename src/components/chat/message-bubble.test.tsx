/**
 * Tests for rendering one chat message with parts-based rendering.
 * @module components/chat/message-bubble.test
 */
import type React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MessageBubble } from "./message-bubble";

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

vi.mock("@/components/ai-elements/reasoning", () => ({
  Reasoning: ({ children, isStreaming }: { children: React.ReactNode; isStreaming?: boolean }) => (
    <div data-testid="reasoning-block" data-streaming={isStreaming}>{children}</div>
  ),
  ReasoningTrigger: () => <div data-testid="reasoning-trigger" />,
  ReasoningContent: ({ children }: { children: string }) => (
    <div data-testid="reasoning-content">{children}</div>
  ),
}));

vi.mock("./tool-call-inline", () => ({
  ToolCallInline: ({ name, state }: { name: string; state: string }) => (
    <div data-testid="tool-call-inline" data-name={name} data-state={state}>{name}</div>
  ),
}));

vi.mock("@/components/ai-elements/shimmer", () => ({
  Shimmer: ({ children, className }: { children: string; className?: string }) => (
    <span data-testid="shimmer" className={className}>{children}</span>
  ),
}));

vi.mock("./steps-summary", () => ({
  StepsSummary: ({ parts, isStreaming, hasTextParts, messageId, onToolApproval }: {
    parts: Array<{ type: string }>;
    isStreaming: boolean;
    hasTextParts: boolean;
    messageId: string;
    onToolApproval?: unknown;
  }) => (
    <div
      data-testid="steps-summary"
      data-parts-count={parts.length}
      data-streaming={isStreaming}
      data-has-text-parts={hasTextParts}
      data-message-id={messageId}
      data-has-approval={!!onToolApproval}
    />
  ),
}));

vi.mock("./preview-attachment", () => ({
  PreviewAttachment: ({ attachment }: { attachment: { filename: string } }) => (
    <div data-testid="preview-attachment">{attachment.filename}</div>
  ),
}));

/* ------------------------------------------------------------------ */
/*  User messages                                                      */
/* ------------------------------------------------------------------ */

describe("MessageBubble — user messages", () => {
  it("renders user text as plain text in a right-aligned bubble", () => {
    render(
      <MessageBubble
        message={{
          id: "1",
          role: "user",
          parts: [{ type: "text", text: "Hello agent" }],
        }}
      />,
    );

    expect(screen.getByTestId("message-bubble")).toBeInTheDocument();
    expect(screen.getByTestId("message-bubble").className).toMatch(/justify-end/);
    expect(screen.getByText("Hello agent")).toBeInTheDocument();
    // User messages should NOT use AI Message components — no data-from attribute
    expect(screen.getByTestId("message-bubble")).not.toHaveAttribute("data-from");
  });

  it("does not render reasoning or tool parts for user messages", () => {
    render(
      <MessageBubble
        message={{
          id: "5",
          role: "user",
          parts: [{ type: "text", text: "User message" }],
        }}
      />,
    );

    expect(screen.queryByTestId("reasoning-block")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tool-call-inline")).not.toBeInTheDocument();
    expect(screen.queryByTestId("steps-summary")).not.toBeInTheDocument();
  });

  it("renders file parts above user text", () => {
    render(
      <MessageBubble
        message={{
          id: "10",
          role: "user",
          parts: [
            {
              type: "file",
              filename: "screenshot.png",
              mediaType: "image/png",
              url: "https://storage.example.com/screenshot.png",
            },
            { type: "text", text: "What is shown here?" },
          ],
        }}
      />,
    );

    expect(screen.getByTestId("preview-attachment")).toHaveTextContent("screenshot.png");
    expect(screen.getByText("What is shown here?")).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  Assistant messages — parts-based rendering                         */
/* ------------------------------------------------------------------ */

describe("MessageBubble — assistant messages", () => {
  it("renders text parts via MessageResponse", () => {
    render(
      <MessageBubble
        message={{
          id: "2",
          role: "assistant",
          parts: [{ type: "text", text: "**Hello**" }],
        }}
      />,
    );

    expect(screen.getByTestId("message-response")).toBeInTheDocument();
    expect(screen.getByText("**Hello**")).toBeInTheDocument();
  });

  it("uses AI Elements Message component with from=assistant", () => {
    render(
      <MessageBubble
        message={{
          id: "2",
          role: "assistant",
          parts: [{ type: "text", text: "Hi" }],
        }}
      />,
    );

    const msg = screen.getByTestId("message-bubble");
    expect(msg).toBeInTheDocument();
    expect(msg).toHaveAttribute("data-from", "assistant");
  });

  it("renders intermediate parts via StepsSummary", () => {
    render(
      <MessageBubble
        message={{
          id: "3",
          role: "assistant",
          parts: [
            { type: "reasoning", text: "Let me think about this..." },
            { type: "text", text: "Here is my answer." },
          ],
        }}
      />,
    );

    const summary = screen.getByTestId("steps-summary");
    expect(summary).toBeInTheDocument();
    expect(summary).toHaveAttribute("data-parts-count", "1");
    expect(screen.getByText("Here is my answer.")).toBeInTheDocument();
  });

  it("does not render StepsSummary when no intermediate parts exist", () => {
    render(
      <MessageBubble
        message={{
          id: "4",
          role: "assistant",
          parts: [{ type: "text", text: "Simple response" }],
        }}
      />,
    );

    expect(screen.queryByTestId("steps-summary")).not.toBeInTheDocument();
    expect(screen.getByText("Simple response")).toBeInTheDocument();
  });

  it("groups reasoning + tool parts in StepsSummary, renders text after", () => {
    render(
      <MessageBubble
        message={{
          id: "6",
          role: "assistant",
          parts: [
            { type: "reasoning", text: "Thinking..." },
            { type: "tool-search_contacts" as const, toolCallId: "tc1", state: "output-available" as const, input: { query: "John" }, output: { results: [] } },
            { type: "text", text: "Found nothing." },
          ],
        }}
      />,
    );

    const summary = screen.getByTestId("steps-summary");
    expect(summary).toHaveAttribute("data-parts-count", "2");
    expect(screen.getByTestId("message-response")).toBeInTheDocument();
  });

  it("includes all tool parts in StepsSummary", () => {
    render(
      <MessageBubble
        message={{
          id: "7",
          role: "assistant",
          parts: [
            {
              type: "tool-search_contacts" as const,
              toolCallId: "tc1",
              state: "output-available" as const,
              input: { query: "John" },
              output: { results: [{ name: "John Doe" }] },
            },
            {
              type: "tool-get_deal_contacts" as const,
              toolCallId: "tc2",
              state: "output-available" as const,
              input: { dealId: "123" },
              output: { contacts: [] },
            },
            { type: "text", text: "Found John Doe." },
          ],
        }}
      />,
    );

    const summary = screen.getByTestId("steps-summary");
    expect(summary).toHaveAttribute("data-parts-count", "2");
  });

  it("shows shimmer when streaming with no parts", () => {
    render(
      <MessageBubble
        message={{ id: "2", role: "assistant", parts: [] }}
        isStreaming
      />,
    );

    expect(screen.getByTestId("shimmer")).toBeInTheDocument();
    expect(screen.getByText("Thinking...")).toBeInTheDocument();
  });

  it("does not show shimmer when parts exist", () => {
    render(
      <MessageBubble
        message={{ id: "2", role: "assistant", parts: [{ type: "text", text: "Hi" }] }}
        isStreaming
      />,
    );

    expect(screen.queryByTestId("shimmer")).not.toBeInTheDocument();
  });

  it("passes isStreaming to StepsSummary", () => {
    render(
      <MessageBubble
        message={{
          id: "8",
          role: "assistant",
          parts: [
            { type: "reasoning", text: "Thinking hard..." },
          ],
        }}
        isStreaming
      />,
    );

    const summary = screen.getByTestId("steps-summary");
    expect(summary).toHaveAttribute("data-streaming", "true");
  });

  it("passes hasTextParts to StepsSummary", () => {
    const { rerender } = render(
      <MessageBubble
        message={{
          id: "9",
          role: "assistant",
          parts: [
            { type: "reasoning", text: "Thinking..." },
            { type: "text", text: "Answer." },
          ],
        }}
      />,
    );

    expect(screen.getByTestId("steps-summary")).toHaveAttribute("data-has-text-parts", "true");

    rerender(
      <MessageBubble
        message={{
          id: "10",
          role: "assistant",
          parts: [
            { type: "reasoning", text: "Still thinking..." },
          ],
        }}
        isStreaming
      />,
    );

    expect(screen.getByTestId("steps-summary")).toHaveAttribute("data-has-text-parts", "false");
  });

  it("passes messageId to StepsSummary", () => {
    render(
      <MessageBubble
        message={{
          id: "msg-42",
          role: "assistant",
          parts: [
            { type: "reasoning", text: "Thinking..." },
            { type: "text", text: "Done." },
          ],
        }}
      />,
    );

    expect(screen.getByTestId("steps-summary")).toHaveAttribute("data-message-id", "msg-42");
  });

  it("forwards onToolApproval to StepsSummary", () => {
    const onToolApproval = vi.fn();
    render(
      <MessageBubble
        message={{
          id: "3",
          role: "assistant",
          parts: [
            { type: "reasoning", text: "..." },
            { type: "text", text: "Answer." },
          ],
        }}
        onToolApproval={onToolApproval}
      />,
    );

    expect(screen.getByTestId("steps-summary")).toHaveAttribute("data-has-approval", "true");
  });

  it("renders file parts for assistant messages without including them in StepsSummary", () => {
    render(
      <MessageBubble
        message={{
          id: "11",
          role: "assistant",
          parts: [
            {
              type: "file",
              filename: "report.png",
              mediaType: "image/png",
              url: "https://storage.example.com/report.png",
            },
            { type: "reasoning", text: "Reviewing the screenshot..." },
            { type: "text", text: "This shows the current pipeline." },
          ],
        }}
      />,
    );

    expect(screen.getByTestId("preview-attachment")).toHaveTextContent("report.png");
    expect(screen.getByTestId("steps-summary")).toHaveAttribute("data-parts-count", "1");
    expect(screen.getByText("This shows the current pipeline.")).toBeInTheDocument();
  });
});
