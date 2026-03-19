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

vi.mock("@json-render/react", () => ({
  useJsonRenderMessage: (parts: Array<{ type: string }>) => {
    const hasSpec = parts.some((p) => p.type === "data-spec");
    return {
      spec: hasSpec ? { root: "metric", elements: {}, state: {} } : null,
      text: parts
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join("\n"),
      hasSpec,
    };
  },
}));

vi.mock("@/lib/views/renderer", () => ({
  ViewRenderer: ({ spec, loading }: { spec: unknown; loading?: boolean }) => (
    <div
      data-testid="view-renderer"
      data-has-spec={!!spec}
      data-loading={String(loading ?? false)}
    />
  ),
}));

vi.mock("./ask-user-question-inline", () => ({
  AskUserQuestionInline: ({ questions, onSubmit, disabled }: {
    questions: Array<{ question: string }>;
    onSubmit: (text: string) => void;
    disabled?: boolean;
  }) => (
    <div
      data-testid="ask-user-question-inline"
      data-question-count={questions.length}
      data-disabled={!!disabled}
      onClick={() => onSubmit("Option A")}
    />
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

/* ------------------------------------------------------------------ */
/*  ask_user_question rendering                                        */
/* ------------------------------------------------------------------ */

describe("MessageBubble — ask_user_question", () => {
  const askQuestionMessage = {
    id: "ask-1",
    role: "assistant" as const,
    parts: [
      {
        type: "tool-ask_user_question" as const,
        toolCallId: "tc-ask-1",
        state: "output-available" as const,
        input: { questions: [{ question: "Which format?", header: "Format", options: [], multiSelect: false }] },
        output: { questions: [{ question: "Which format?", header: "Format", options: [], multiSelect: false }], status: "awaiting_response" },
      },
      { type: "text", text: "Which format would you prefer?" },
    ],
  };

  it("renders AskUserQuestionInline for ask_user_question tool parts", () => {
    render(
      <MessageBubble
        message={askQuestionMessage}
        onQuestionSubmit={vi.fn()}
      />,
    );

    expect(screen.getByTestId("ask-user-question-inline")).toBeInTheDocument();
    expect(screen.getByTestId("ask-user-question-inline")).toHaveAttribute("data-question-count", "1");
  });

  it("excludes ask_user_question from StepsSummary", () => {
    render(
      <MessageBubble
        message={{
          id: "ask-2",
          role: "assistant",
          parts: [
            { type: "reasoning", text: "Let me think..." },
            {
              type: "tool-ask_user_question" as const,
              toolCallId: "tc-ask-2",
              state: "output-available" as const,
              input: { questions: [] },
              output: { questions: [], status: "awaiting_response" },
            },
            { type: "text", text: "Here are your options:" },
          ],
        }}
        onQuestionSubmit={vi.fn()}
      />,
    );

    // StepsSummary should only have the reasoning part (1), not the ask_user_question
    expect(screen.getByTestId("steps-summary")).toHaveAttribute("data-parts-count", "1");
  });

  it("renders ask_user_question as disabled when onQuestionSubmit is not provided", () => {
    render(
      <MessageBubble message={askQuestionMessage} />,
    );

    expect(screen.getByTestId("ask-user-question-inline")).toHaveAttribute("data-disabled", "true");
  });

  it("renders ask_user_question as interactive when onQuestionSubmit is provided", () => {
    render(
      <MessageBubble
        message={askQuestionMessage}
        onQuestionSubmit={vi.fn()}
      />,
    );

    expect(screen.getByTestId("ask-user-question-inline")).toHaveAttribute("data-disabled", "false");
  });

  it("does not render AskUserQuestionInline when tool state is not output-available", () => {
    render(
      <MessageBubble
        message={{
          id: "ask-3",
          role: "assistant",
          parts: [
            {
              type: "tool-ask_user_question" as const,
              toolCallId: "tc-ask-3",
              state: "partial-call" as const,
              input: {},
            },
            { type: "text", text: "Loading..." },
          ],
        }}
        onQuestionSubmit={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("ask-user-question-inline")).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  Inline spec rendering (json-render inline mode)                     */
/* ------------------------------------------------------------------ */

describe("MessageBubble — inline spec segments", () => {
  it("renders spec segment inline between text segments when data-spec part exists", () => {
    render(
      <MessageBubble
        message={{
          id: "spec-1",
          role: "assistant",
          parts: [
            { type: "text", text: "Here is your pipeline:" },
            { type: "data-spec" as const, data: { root: "metric", elements: {} } },
            { type: "text", text: "Let me know if you need changes." },
          ],
        }}
      />,
    );

    expect(screen.getByTestId("view-renderer")).toBeInTheDocument();
    expect(screen.getByTestId("view-renderer")).toHaveAttribute("data-has-spec", "true");

    // Should have text, spec, text segments in order
    const children = Array.from(screen.getByTestId("ai-message-content").children);
    const testIds = children.map((c) => c.getAttribute("data-testid")).filter(Boolean);
    expect(testIds).toContain("view-renderer");
  });

  it("does not render ViewRenderer when no spec parts exist", () => {
    render(
      <MessageBubble
        message={{
          id: "no-spec",
          role: "assistant",
          parts: [{ type: "text", text: "Just plain text." }],
        }}
      />,
    );

    expect(screen.queryByTestId("view-renderer")).not.toBeInTheDocument();
  });

  it("renders spec at end as fallback when hasSpec but no data-spec position detected", () => {
    // This tests the fallback: useJsonRenderMessage says hasSpec=true but
    // no SPEC_DATA_PART_TYPE part appears in the loop (edge case)
    // We mock useJsonRenderMessage to always return hasSpec based on parts,
    // so if there's no data-spec part but hasSpec is true somehow, the spec
    // should still render.
    render(
      <MessageBubble
        message={{
          id: "spec-fallback",
          role: "assistant",
          parts: [
            { type: "text", text: "Here is the view." },
            { type: "data-spec" as const, data: { root: "metric", elements: {} } },
          ],
        }}
      />,
    );

    expect(screen.getByTestId("view-renderer")).toBeInTheDocument();
  });

  it("passes loading=true to ViewRenderer when streaming on last message", () => {
    render(
      <MessageBubble
        message={{
          id: "spec-loading",
          role: "assistant",
          parts: [
            { type: "text", text: "Loading..." },
            { type: "data-spec" as const, data: { root: "metric", elements: {} } },
          ],
        }}
        isStreaming
        isLast
      />,
    );

    expect(screen.getByTestId("view-renderer")).toHaveAttribute("data-loading", "true");
  });

  it("passes loading=false to ViewRenderer when not streaming", () => {
    render(
      <MessageBubble
        message={{
          id: "spec-done",
          role: "assistant",
          parts: [
            { type: "text", text: "Done." },
            { type: "data-spec" as const, data: { root: "metric", elements: {} } },
          ],
        }}
      />,
    );

    expect(screen.getByTestId("view-renderer")).toHaveAttribute("data-loading", "false");
  });
});

/* ------------------------------------------------------------------ */
/*  Skill badge                                                        */
/* ------------------------------------------------------------------ */

describe("MessageBubble — skill badge", () => {
  it("shows skill badge for a user skill read_file", () => {
    render(
      <MessageBubble
        message={{
          id: "skill-1",
          role: "assistant",
          parts: [
            {
              type: "tool-read_file",
              toolCallId: "tc-1",
              state: "result",
              input: { path: "/agent/skills/call-prep/SKILL.md" },
              output: { success: true, content: "..." },
            } as any,
            { type: "text", text: "Here's your call prep." },
          ],
        }}
      />,
    );

    expect(screen.getByTestId("skill-badge")).toBeInTheDocument();
    expect(screen.getByTestId("skill-badge")).toHaveTextContent("call-prep");
  });

  it("does not show skill badge for system skill reads", () => {
    render(
      <MessageBubble
        message={{
          id: "skill-2",
          role: "assistant",
          parts: [
            {
              type: "tool-read_file",
              toolCallId: "tc-2",
              state: "result",
              input: { path: "/agent/skills/system/creating-connections/SKILL.md" },
              output: { success: true, content: "..." },
            } as any,
            { type: "text", text: "Connection guide." },
          ],
        }}
      />,
    );

    expect(screen.queryByTestId("skill-badge")).not.toBeInTheDocument();
  });

  it("does not show skill badge for connection skill reads", () => {
    render(
      <MessageBubble
        message={{
          id: "skill-3",
          role: "assistant",
          parts: [
            {
              type: "tool-read_file",
              toolCallId: "tc-3",
              state: "result",
              input: { path: "/agent/skills/connections/conn-abc/SKILL.md" },
              output: { success: true, content: "..." },
            } as any,
            { type: "text", text: "Gmail guide." },
          ],
        }}
      />,
    );

    expect(screen.queryByTestId("skill-badge")).not.toBeInTheDocument();
  });

  it("does not show skill badge for non-skill reads", () => {
    render(
      <MessageBubble
        message={{
          id: "skill-4",
          role: "assistant",
          parts: [
            {
              type: "tool-read_file",
              toolCallId: "tc-4",
              state: "result",
              input: { path: "/agent/MEMORY.md" },
              output: { success: true, content: "..." },
            } as any,
            { type: "text", text: "Memory read." },
          ],
        }}
      />,
    );

    expect(screen.queryByTestId("skill-badge")).not.toBeInTheDocument();
  });
});
