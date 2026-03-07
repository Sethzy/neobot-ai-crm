/**
 * Tests for the collapsible steps summary that hides intermediate parts.
 * @module components/chat/steps-summary.test
 */
import type React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StepsSummary } from "./steps-summary";

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

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
  ToolCallInline: ({ name, state, approvalId, onToolApproval }: {
    name: string;
    state: string;
    approvalId?: string;
    onToolApproval?: unknown;
  }) => (
    <div
      data-testid="tool-call-inline"
      data-name={name}
      data-state={state}
      data-approval-id={approvalId}
      data-has-approval={!!onToolApproval}
    >
      {name}
    </div>
  ),
}));

vi.mock("@/components/ai-elements/shimmer", () => ({
  Shimmer: ({ children, className }: { children: string; className?: string }) => (
    <span data-testid="shimmer" className={className}>{children}</span>
  ),
}));

/* ------------------------------------------------------------------ */
/*  Test data                                                          */
/* ------------------------------------------------------------------ */

const parts = [
  { type: "reasoning" as const, text: "Let me think..." },
  { type: "tool-search_contacts" as const, toolCallId: "tc1", state: "output-available" as const, input: { query: "John" }, output: { results: [] } },
  { type: "tool-search_deals" as const, toolCallId: "tc2", state: "output-available" as const, input: {}, output: { deals: [] } },
  { type: "reasoning" as const, text: "Now I know." },
];

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("StepsSummary", () => {
  it("shows 'Done in N steps' when complete (not streaming)", () => {
    render(<StepsSummary parts={parts} isStreaming={false} hasTextParts={false} messageId="1" />);

    expect(screen.getByTestId("steps-summary-trigger")).toHaveTextContent(/done in 4 steps/i);
  });

  it("counts all parts as steps, not just tools", () => {
    const onlyTools = [
      { type: "tool-search_contacts" as const, toolCallId: "tc1", state: "output-available" as const, input: {}, output: {} },
    ];
    render(<StepsSummary parts={onlyTools} isStreaming={false} hasTextParts={false} messageId="1" />);

    expect(screen.getByTestId("steps-summary-trigger")).toHaveTextContent(/done in 1 step\b/i);
  });

  it("shows dynamic action text from last part when streaming", () => {
    const streamingParts = [
      { type: "reasoning" as const, text: "Thinking..." },
      { type: "tool-search_contacts" as const, toolCallId: "tc1", state: "input-available" as const, input: { query: "John" } },
    ];
    render(<StepsSummary parts={streamingParts} isStreaming={true} hasTextParts={false} messageId="1" />);

    // Should show the current tool action, not static "Working..."
    expect(screen.getByTestId("steps-summary-trigger")).toHaveTextContent(/search_contacts/i);
  });

  it("shows 'Thinking...' when only reasoning parts exist during streaming", () => {
    const reasoningOnly = [
      { type: "reasoning" as const, text: "Let me think..." },
    ];
    render(<StepsSummary parts={reasoningOnly} isStreaming={true} hasTextParts={false} messageId="1" />);

    expect(screen.getByTestId("steps-summary-trigger")).toHaveTextContent(/thinking/i);
  });

  it("uses Shimmer component when streaming and not complete", () => {
    const streamingParts = [
      { type: "reasoning" as const, text: "Let me think..." },
    ];
    render(<StepsSummary parts={streamingParts} isStreaming={true} hasTextParts={false} messageId="1" />);

    expect(screen.getByTestId("shimmer")).toBeInTheDocument();
  });

  it("does not use Shimmer when complete", () => {
    render(<StepsSummary parts={parts} isStreaming={false} hasTextParts={false} messageId="1" />);

    expect(screen.queryByTestId("shimmer")).not.toBeInTheDocument();
  });

  it("treats streaming with text parts as complete (no shimmer)", () => {
    render(<StepsSummary parts={parts} isStreaming={true} hasTextParts={true} messageId="1" />);

    expect(screen.queryByTestId("shimmer")).not.toBeInTheDocument();
    expect(screen.getByTestId("steps-summary-trigger")).toHaveTextContent(/done in 4 steps/i);
  });

  it("hides intermediate parts when collapsed", () => {
    render(<StepsSummary parts={parts} isStreaming={false} hasTextParts={false} messageId="1" />);

    expect(screen.queryByTestId("reasoning-block")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tool-call-inline")).not.toBeInTheDocument();
  });

  it("shows intermediate parts when expanded", async () => {
    const user = userEvent.setup();
    render(<StepsSummary parts={parts} isStreaming={false} hasTextParts={false} messageId="1" />);

    await user.click(screen.getByTestId("steps-summary-trigger"));

    expect(screen.getAllByTestId("reasoning-block")).toHaveLength(2);
    expect(screen.getAllByTestId("tool-call-inline")).toHaveLength(2);
  });

  it("shows chevron that toggles on expand", async () => {
    const user = userEvent.setup();
    render(<StepsSummary parts={parts} isStreaming={false} hasTextParts={false} messageId="1" />);

    const trigger = screen.getByTestId("steps-summary-trigger");
    expect(trigger).toHaveTextContent("▶");

    await user.click(trigger);
    expect(trigger).toHaveTextContent("▼");
  });

  it("renders in muted text style", () => {
    render(<StepsSummary parts={parts} isStreaming={false} hasTextParts={false} messageId="1" />);

    expect(screen.getByTestId("steps-summary-trigger").className).toMatch(/text-muted-foreground/);
  });

  it("forwards onToolApproval and approval metadata to ToolCallInline", async () => {
    const user = userEvent.setup();
    const onToolApproval = vi.fn();
    const approvalParts = [
      {
        type: "tool-write_file" as const,
        toolCallId: "tc-1",
        state: "approval-requested" as const,
        input: { path: "/memory.md" },
        approval: { id: "approval-abc" },
      },
    ];
    render(
      <StepsSummary
        parts={approvalParts}
        isStreaming={false}
        hasTextParts={false}
        messageId="1"
        onToolApproval={onToolApproval}
      />,
    );

    await user.click(screen.getByTestId("steps-summary-trigger"));

    const toolCall = screen.getByTestId("tool-call-inline");
    expect(toolCall).toHaveAttribute("data-has-approval", "true");
    expect(toolCall).toHaveAttribute("data-approval-id", "approval-abc");
  });
});
