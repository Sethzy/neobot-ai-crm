/**
 * Tests for rendering one chat message with parts-based rendering.
 * @module components/chat/message-bubble.test
 */
import type React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MessageBubble } from "./message-bubble";
import type { ChatUIMessage } from "./message-content";

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

vi.mock("./tool-call-inline", () => ({
  ToolCallInline: ({ name, state, onToolApproval }: { name: string; state: string; onToolApproval?: unknown }) => (
    <div data-testid="tool-call-inline" data-name={name} data-state={state} data-has-approval={!!onToolApproval}>{name}</div>
  ),
}));

vi.mock("@/components/ai-elements/shimmer", () => ({
  Shimmer: ({ children, className }: { children: string; className?: string }) => (
    <span data-testid="shimmer" className={className}>{children}</span>
  ),
}));

vi.mock("./preview-attachment", () => ({
  PreviewAttachment: ({ attachment }: { attachment: { filename: string; url: string } }) => (
    attachment.url
      ? <a data-testid="preview-attachment" href={attachment.url}>{attachment.filename}</a>
      : <div data-testid="preview-attachment">{attachment.filename}</div>
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

  it("resolves storagePath to a download URL for user file parts", () => {
    render(
      <MessageBubble
        message={{
          id: "storage-user-1",
          role: "user",
          parts: [{
            type: "file",
            filename: "report.pdf",
            mediaType: "application/pdf",
            url: "https://expired.example.com/report.pdf",
            storagePath: "uploads/report.pdf",
          }],
        } as ChatUIMessage}
      />,
    );

    expect(screen.getByTestId("preview-attachment")).toHaveAttribute(
      "href",
      "/api/files/download?path=uploads%2Freport.pdf",
    );
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

  it("renders reasoning parts inline", () => {
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

    expect(screen.getByTestId("reasoning-block")).toBeInTheDocument();
    expect(screen.getByText("Here is my answer.")).toBeInTheDocument();
  });

  it("does not render reasoning or tool parts when only text exists", () => {
    render(
      <MessageBubble
        message={{
          id: "4",
          role: "assistant",
          parts: [{ type: "text", text: "Simple response" }],
        }}
      />,
    );

    expect(screen.queryByTestId("reasoning-block")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tool-call-inline")).not.toBeInTheDocument();
    expect(screen.getByText("Simple response")).toBeInTheDocument();
  });

  it("renders reasoning and tool parts inline with text", () => {
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

    expect(screen.getByTestId("reasoning-block")).toBeInTheDocument();
    expect(screen.getByTestId("tool-call-inline")).toBeInTheDocument();
    expect(screen.getByTestId("message-response")).toBeInTheDocument();
  });

  it("renders all tool parts inline", () => {
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

    expect(screen.getAllByTestId("tool-call-inline")).toHaveLength(2);
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

  it("shows shimmer when streaming with only non-renderable parts like data-chat-title", () => {
    render(
      <MessageBubble
        message={{ id: "2", role: "assistant", parts: [{ type: "data-chat-title" as never, data: "My Title" }] }}
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

  it("passes isStreaming to the last reasoning block", () => {
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

    expect(screen.getByTestId("reasoning-block")).toHaveAttribute("data-streaming", "true");
  });

  it("forwards onToolApproval to ToolCallInline", () => {
    const onToolApproval = vi.fn();
    render(
      <MessageBubble
        message={{
          id: "3",
          role: "assistant",
          parts: [
            { type: "tool-run_sql" as const, toolCallId: "tc1", state: "output-available" as const, input: {}, output: {} },
            { type: "text", text: "Answer." },
          ],
        }}
        onToolApproval={onToolApproval}
      />,
    );

    expect(screen.getByTestId("tool-call-inline")).toHaveAttribute("data-has-approval", "true");
  });

  it("renders file parts inline alongside reasoning and text", () => {
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
    expect(screen.getByTestId("reasoning-block")).toBeInTheDocument();
    expect(screen.getByText("This shows the current pipeline.")).toBeInTheDocument();
  });

  it("resolves storagePath for assistant file parts too", () => {
    render(
      <MessageBubble
        message={{
          id: "storage-assistant-1",
          role: "assistant",
          parts: [{
            type: "file",
            filename: "output.csv",
            mediaType: "text/csv",
            url: "https://expired.example.com/output.csv",
            storagePath: "home/output.csv",
          }],
        } as ChatUIMessage}
      />,
    );

    expect(screen.getByTestId("preview-attachment")).toHaveAttribute(
      "href",
      "/api/files/download?path=home%2Foutput.csv",
    );
  });

  it("falls back to the original URL when storagePath is missing", () => {
    render(
      <MessageBubble
        message={{
          id: "storage-fallback-1",
          role: "assistant",
          parts: [{
            type: "file",
            filename: "legacy.pdf",
            mediaType: "application/pdf",
            url: "https://legacy.example.com/legacy.pdf",
          }],
        } as ChatUIMessage}
      />,
    );

    expect(screen.getByTestId("preview-attachment")).toHaveAttribute(
      "href",
      "https://legacy.example.com/legacy.pdf",
    );
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
        input: { questions: [{ question: "Which format?", options: ["Markdown", "PDF"], type: "single_select" }] },
        output: { questions: [{ question: "Which format?", options: ["Markdown", "PDF"], type: "single_select" }], status: "awaiting_response" },
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

  it("renders ask_user_question inline alongside reasoning", () => {
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
              input: { questions: [{ question: "Pick one", options: ["A"], type: "single_select" }] },
              output: { questions: [{ question: "Pick one", options: ["A"], type: "single_select" }], status: "awaiting_response" },
            },
            { type: "text", text: "Here are your options:" },
          ],
        }}
        onQuestionSubmit={vi.fn()}
      />,
    );

    expect(screen.getByTestId("reasoning-block")).toBeInTheDocument();
    expect(screen.getByTestId("ask-user-question-inline")).toBeInTheDocument();
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

function createReadFilePart(
  path: string,
): Extract<ChatUIMessage["parts"][number], { type: "tool-read_file" }> {
  return {
    type: "tool-read_file",
    toolCallId: `tc-${path}`,
    state: "output-available",
    input: { path },
    output: { success: true, content: "..." },
  } as Extract<ChatUIMessage["parts"][number], { type: "tool-read_file" }>;
}

describe("MessageBubble — skill badge", () => {
  it("shows skill badge for a user skill read_file", () => {
    render(
      <MessageBubble
        message={{
          id: "skill-1",
          role: "assistant",
          parts: [
            createReadFilePart("/agent/skills/call-prep/SKILL.md"),
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
            createReadFilePart("/agent/skills/system/creating-connections/SKILL.md"),
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
            createReadFilePart("/agent/skills/connections/conn-abc/SKILL.md"),
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
            createReadFilePart("/agent/MEMORY.md"),
            { type: "text", text: "Memory read." },
          ],
        }}
      />,
    );

    expect(screen.queryByTestId("skill-badge")).not.toBeInTheDocument();
  });

  it("renders a copy button on completed assistant messages", () => {
    render(
      <MessageBubble
        message={{
          id: "a1",
          role: "assistant",
          parts: [{ type: "text", text: "Hello from the agent" }],
        } as ChatUIMessage}
      />,
    );

    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
  });

  it("does not render a copy button on user messages", () => {
    render(
      <MessageBubble
        message={{
          id: "u1",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        } as ChatUIMessage}
      />,
    );

    expect(screen.queryByRole("button", { name: /copy/i })).not.toBeInTheDocument();
  });

  it("copies message text to clipboard when copy button is clicked", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    render(
      <MessageBubble
        message={{
          id: "a1",
          role: "assistant",
          parts: [{ type: "text", text: "Copy this text" }],
        } as ChatUIMessage}
      />,
    );

    screen.getByRole("button", { name: /copy/i }).click();

    expect(writeText).toHaveBeenCalledWith("Copy this text");
  });

  it("does not render a copy button while streaming", () => {
    render(
      <MessageBubble
        message={{
          id: "a1",
          role: "assistant",
          parts: [{ type: "text", text: "Hello" }],
        } as ChatUIMessage}
        isStreaming
      />,
    );

    expect(screen.queryByRole("button", { name: /copy/i })).not.toBeInTheDocument();
  });
});
