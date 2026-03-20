/**
 * Tests for the AskUserQuestionInline interactive options component.
 * Per-type behavior matrix:
 *   single_select: radios, Skip, "Something else...", Continue →
 *   multi_select:  checkboxes, counter, Cmd+Enter, "Something else...", Continue → (NO Skip)
 *   rank_priorities: drag handles, numbered, Skip, Continue → (NO "Something else...")
 * @module components/chat/ask-user-question-inline.test
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AskUserQuestionInline, type AskUserQuestion } from "./ask-user-question-inline";

const singleQ: AskUserQuestion = {
  question: "What format should the article be?",
  options: ["Technical deep-dive", "Practical how-to guide", "Opinion piece", "Explainer for beginners"],
  type: "single_select",
};

const multiQ: AskUserQuestion = {
  question: "Which sections should the article include?",
  options: ["Code examples", "Architecture diagrams", "Comparison table", "Further reading"],
  type: "multi_select",
};

const rankQ: AskUserQuestion = {
  question: "Rank these by importance to you",
  options: ["Response speed", "Accuracy", "Cost efficiency"],
  type: "rank_priorities",
};

describe("AskUserQuestionInline", () => {
  // ─── single_select: radio buttons ─────────────────────────────

  it("renders question text and all options as radio buttons", () => {
    render(<AskUserQuestionInline questions={[singleQ]} onSubmit={vi.fn()} />);

    expect(screen.getByText("What format should the article be?")).toBeInTheDocument();
    expect(screen.getByText("Technical deep-dive")).toBeInTheDocument();
    expect(screen.getByText("Practical how-to guide")).toBeInTheDocument();
    expect(screen.getByText("Opinion piece")).toBeInTheDocument();
    expect(screen.getByText("Explainer for beginners")).toBeInTheDocument();
  });

  it("single question — no pagination controls shown", () => {
    render(<AskUserQuestionInline questions={[singleQ]} onSubmit={vi.fn()} />);
    expect(screen.queryByTestId("ask-question-pagination")).not.toBeInTheDocument();
  });

  it("single_select: clicking option does NOT submit — must click Continue", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionInline questions={[singleQ]} onSubmit={onSubmit} />);
    await user.click(screen.getByText("Practical how-to guide"));

    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("ask-question-continue"));

    expect(onSubmit).toHaveBeenCalledWith(
      "Q: What format should the article be?\nA: Practical how-to guide",
    );
  });

  it("Continue is disabled until an option is selected", () => {
    render(<AskUserQuestionInline questions={[singleQ]} onSubmit={vi.fn()} />);
    expect(screen.getByTestId("ask-question-continue")).toBeDisabled();
  });

  it("does not call onSubmit when disabled", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionInline questions={[singleQ]} onSubmit={onSubmit} disabled />);
    await user.click(screen.getByText("Practical how-to guide"));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("hides interactive controls when disabled", () => {
    render(<AskUserQuestionInline questions={[multiQ]} onSubmit={vi.fn()} disabled />);

    expect(screen.queryByTestId("ask-question-other-input")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ask-question-continue")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ask-question-skip")).not.toBeInTheDocument();
  });

  // ─── "Something else..." ──────────────────────────────────────

  it("shows Something else input for single_select (always visible)", () => {
    render(<AskUserQuestionInline questions={[singleQ]} onSubmit={vi.fn()} />);
    expect(screen.getByPlaceholderText("Something else...")).toBeInTheDocument();
  });

  it("shows Something else input for multi_select", () => {
    render(<AskUserQuestionInline questions={[multiQ]} onSubmit={vi.fn()} />);
    expect(screen.getByPlaceholderText("Something else...")).toBeInTheDocument();
  });

  it("does NOT show Something else for rank_priorities", () => {
    render(<AskUserQuestionInline questions={[rankQ]} onSubmit={vi.fn()} />);
    expect(screen.queryByTestId("ask-question-other-input")).not.toBeInTheDocument();
  });

  it("Something else overrides radio selection when both present", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionInline questions={[singleQ]} onSubmit={onSubmit} />);
    await user.click(screen.getByText("Opinion piece"));
    await user.type(screen.getByPlaceholderText("Something else..."), "Case study");
    await user.click(screen.getByTestId("ask-question-continue"));

    expect(onSubmit).toHaveBeenCalledWith(
      "Q: What format should the article be?\nA: Case study",
    );
  });

  it("submits custom text on Enter key", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionInline questions={[singleQ]} onSubmit={onSubmit} />);
    await user.type(screen.getByPlaceholderText("Something else..."), "Custom{Enter}");

    expect(onSubmit).toHaveBeenCalledWith(
      "Q: What format should the article be?\nA: Custom",
    );
  });

  // ─── multi_select ─────────────────────────────────────────────

  it("multi_select renders checkboxes and Continue button", () => {
    render(<AskUserQuestionInline questions={[multiQ]} onSubmit={vi.fn()} />);

    expect(screen.getByTestId("ask-question-continue")).toBeInTheDocument();
    expect(screen.getByTestId("ask-question-continue")).toBeDisabled();
  });

  it("multi_select has NO Skip button (counter replaces it)", () => {
    render(<AskUserQuestionInline questions={[multiQ]} onSubmit={vi.fn()} />);
    expect(screen.queryByTestId("ask-question-skip")).not.toBeInTheDocument();
  });

  it("multi_select shows selection counter", async () => {
    const user = userEvent.setup();

    render(<AskUserQuestionInline questions={[multiQ]} onSubmit={vi.fn()} />);
    const options = screen.getAllByTestId("ask-question-option");
    await user.click(options[0]);
    await user.click(options[2]);

    expect(screen.getByTestId("ask-question-counter")).toHaveTextContent("2 selected");
  });

  it("multi_select collects selections and submits on Continue", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionInline questions={[multiQ]} onSubmit={onSubmit} />);
    const options = screen.getAllByTestId("ask-question-option");
    await user.click(options[0]);
    await user.click(options[2]);
    await user.click(screen.getByTestId("ask-question-continue"));

    expect(onSubmit).toHaveBeenCalledWith(
      "Q: Which sections should the article include?\nA: Code examples, Comparison table",
    );
  });

  it("multi_select toggles selection", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionInline questions={[multiQ]} onSubmit={onSubmit} />);
    const options = screen.getAllByTestId("ask-question-option");
    await user.click(options[0]);
    await user.click(options[2]);
    await user.click(options[0]); // deselect first
    await user.click(screen.getByTestId("ask-question-continue"));

    expect(onSubmit).toHaveBeenCalledWith(
      "Q: Which sections should the article include?\nA: Comparison table",
    );
  });

  // ─── rank_priorities ──────────────────────────────────────────

  it("rank_priorities renders drag handles and numbered items", () => {
    render(<AskUserQuestionInline questions={[rankQ]} onSubmit={vi.fn()} />);

    expect(screen.getByText("Response speed")).toBeInTheDocument();
    expect(screen.getByText("Accuracy")).toBeInTheDocument();
    expect(screen.getByText("Cost efficiency")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("rank_priorities has Skip button", () => {
    render(<AskUserQuestionInline questions={[rankQ]} onSubmit={vi.fn()} />);
    expect(screen.getByTestId("ask-question-skip")).toBeInTheDocument();
  });

  it("rank_priorities submits numbered format without prefix", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionInline questions={[rankQ]} onSubmit={onSubmit} />);
    await user.click(screen.getByTestId("ask-question-continue"));

    expect(onSubmit).toHaveBeenCalledWith(
      "Q: Rank these by importance to you\nA: 1. Response speed, 2. Accuracy, 3. Cost efficiency",
    );
  });

  // ─── Skip + Escape key ──────────────────────────────────────────

  it("single_select has Skip button", () => {
    render(<AskUserQuestionInline questions={[singleQ]} onSubmit={vi.fn()} />);
    expect(screen.getByTestId("ask-question-skip")).toBeInTheDocument();
  });

  it("Escape key triggers skip for single_select", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionInline questions={[singleQ]} onSubmit={onSubmit} />);
    await user.keyboard("{Escape}");

    // Single question skipped → all skipped → no message
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Escape key does NOT trigger skip for multi_select", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionInline questions={[multiQ]} onSubmit={onSubmit} />);
    await user.keyboard("{Escape}");

    expect(onSubmit).not.toHaveBeenCalled();
    // Widget should still be visible
    expect(screen.getByTestId("ask-user-question-inline")).toBeInTheDocument();
  });

  it("Escape does not fire after dismiss", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionInline questions={[singleQ, rankQ]} onSubmit={onSubmit} />);

    // Answer Q1 so we have a recorded answer
    await user.click(screen.getByText("Technical deep-dive"));
    await user.click(screen.getByTestId("ask-question-continue"));

    // Now on Q2 — dismiss
    await user.click(screen.getByTestId("ask-question-dismiss"));

    // Widget is gone
    expect(screen.queryByTestId("ask-user-question-inline")).not.toBeInTheDocument();

    // Press Escape — should NOT submit the Q1 answer
    await user.keyboard("{Escape}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // ─── Cmd+Enter shortcut ───────────────────────────────────────

  it("Cmd+Enter submits multi_select when options are selected", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionInline questions={[multiQ]} onSubmit={onSubmit} />);
    const options = screen.getAllByTestId("ask-question-option");
    await user.click(options[0]); // Code examples
    await user.click(options[2]); // Comparison table

    await user.keyboard("{Meta>}{Enter}{/Meta}");

    expect(onSubmit).toHaveBeenCalledWith(
      "Q: Which sections should the article include?\nA: Code examples, Comparison table",
    );
  });

  // ─── Skipped questions omitted from message ───────────────────

  it("skipped questions are omitted from the user message", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionInline questions={[singleQ, rankQ]} onSubmit={onSubmit} />);

    // Skip Q1 (single_select)
    await user.click(screen.getByTestId("ask-question-skip"));

    // Answer Q2 (rank_priorities) with default order
    await user.click(screen.getByTestId("ask-question-continue"));

    // Only Q2 appears — Q1 is omitted
    expect(onSubmit).toHaveBeenCalledWith(
      "Q: Rank these by importance to you\nA: 1. Response speed, 2. Accuracy, 3. Cost efficiency",
    );
  });

  // ─── Dismiss X — silent, no message ───────────────────────────

  it("dismiss button closes widget silently — no onSubmit called", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionInline questions={[singleQ, multiQ]} onSubmit={onSubmit} />);

    await user.click(screen.getByTestId("ask-question-dismiss"));

    // Widget gone, no message sent
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByTestId("ask-user-question-inline")).not.toBeInTheDocument();
  });

  // ─── Multi-question pagination ────────────────────────────────

  it("shows pagination with question counter and dot indicators", () => {
    render(<AskUserQuestionInline questions={[singleQ, multiQ]} onSubmit={vi.fn()} />);

    expect(screen.getByTestId("ask-question-pagination")).toBeInTheDocument();
    expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
    expect(screen.getByTestId("ask-question-dots")).toBeInTheDocument();
  });

  it("answering Q1 via Continue advances to Q2", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionInline questions={[singleQ, multiQ]} onSubmit={onSubmit} />);

    expect(screen.getByText("What format should the article be?")).toBeInTheDocument();
    expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();

    await user.click(screen.getByText("Technical deep-dive"));
    await user.click(screen.getByTestId("ask-question-continue"));

    expect(screen.getByText("Which sections should the article include?")).toBeInTheDocument();
    expect(screen.getByText("Question 2 of 2")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("answering last question submits all answered Q&A pairs", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionInline questions={[singleQ, multiQ]} onSubmit={onSubmit} />);

    await user.click(screen.getByText("Technical deep-dive"));
    await user.click(screen.getByTestId("ask-question-continue"));

    const options = screen.getAllByTestId("ask-question-option");
    await user.click(options[0]); // Code examples
    await user.click(screen.getByTestId("ask-question-continue"));

    expect(onSubmit).toHaveBeenCalledWith(
      "Q: What format should the article be?\nA: Technical deep-dive\n\nQ: Which sections should the article include?\nA: Code examples",
    );
  });

  it("prev button navigates back", async () => {
    const user = userEvent.setup();

    render(<AskUserQuestionInline questions={[singleQ, multiQ]} onSubmit={vi.fn()} />);

    await user.click(screen.getByText("Technical deep-dive"));
    await user.click(screen.getByTestId("ask-question-continue"));
    expect(screen.getByText("Question 2 of 2")).toBeInTheDocument();

    await user.click(screen.getByTestId("ask-question-prev"));
    expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("What format should the article be?")).toBeInTheDocument();
  });

  // ─── Disabled state ───────────────────────────────────────────

  it("disabled multi-question shows all questions stacked", () => {
    render(
      <AskUserQuestionInline questions={[singleQ, multiQ]} onSubmit={vi.fn()} disabled />,
    );

    expect(screen.getByText("What format should the article be?")).toBeInTheDocument();
    expect(screen.getByText("Which sections should the article include?")).toBeInTheDocument();
    expect(screen.queryByTestId("ask-question-pagination")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ask-question-skip")).not.toBeInTheDocument();
  });
});
