/**
 * Tests for the AskUserQuestionInline interactive options component.
 * @module components/chat/ask-user-question-inline.test
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AskUserQuestionInline, type AskUserQuestion } from "./ask-user-question-inline";

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: { children: React.ReactNode; variant?: string; className?: string }) => (
    <span data-testid="badge" {...props}>{children}</span>
  ),
}));

const singleSelectQuestion: AskUserQuestion = {
  question: "Which format should I use?",
  header: "Format",
  options: [
    { label: "Markdown (Recommended)", description: "Plain text with formatting" },
    { label: "PDF", description: "Formatted document for sharing" },
    { label: "CSV", description: "Spreadsheet-compatible format" },
  ],
  multiSelect: false,
};

const multiSelectQuestion: AskUserQuestion = {
  question: "Which features do you want?",
  header: "Features",
  options: [
    { label: "CRM sync", description: "Sync contacts automatically" },
    { label: "Email alerts", description: "Get notified on changes" },
  ],
  multiSelect: true,
};

describe("AskUserQuestionInline", () => {
  it("renders question text and header badge", () => {
    render(
      <AskUserQuestionInline
        questions={[singleSelectQuestion]}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Which format should I use?")).toBeInTheDocument();
    expect(screen.getByText("Format")).toBeInTheDocument();
  });

  it("renders all option buttons", () => {
    render(
      <AskUserQuestionInline
        questions={[singleSelectQuestion]}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Markdown (Recommended)")).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText("CSV")).toBeInTheDocument();
  });

  it("renders option descriptions", () => {
    render(
      <AskUserQuestionInline
        questions={[singleSelectQuestion]}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Plain text with formatting")).toBeInTheDocument();
    expect(screen.getByText("Formatted document for sharing")).toBeInTheDocument();
  });

  it("calls onSubmit with label on single-select click", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <AskUserQuestionInline
        questions={[singleSelectQuestion]}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByText("PDF"));

    expect(onSubmit).toHaveBeenCalledWith("PDF");
  });

  it("does not call onSubmit when disabled", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <AskUserQuestionInline
        questions={[singleSelectQuestion]}
        onSubmit={onSubmit}
        disabled
      />,
    );

    await user.click(screen.getByText("PDF"));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("hides 'Other' trigger and 'Done' button when disabled", () => {
    render(
      <AskUserQuestionInline
        questions={[multiSelectQuestion]}
        onSubmit={vi.fn()}
        disabled
      />,
    );

    expect(screen.queryByTestId("ask-question-other-trigger")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ask-question-done")).not.toBeInTheDocument();
  });

  it("shows 'Other' input when clicking Other trigger", async () => {
    const user = userEvent.setup();

    render(
      <AskUserQuestionInline
        questions={[singleSelectQuestion]}
        onSubmit={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("ask-question-other-trigger"));

    expect(screen.getByTestId("ask-question-other-input")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Type your response...")).toBeInTheDocument();
  });

  it("submits custom text via 'Other' input", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <AskUserQuestionInline
        questions={[singleSelectQuestion]}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByTestId("ask-question-other-trigger"));
    await user.type(screen.getByPlaceholderText("Type your response..."), "Plain text");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(onSubmit).toHaveBeenCalledWith("Plain text");
  });

  it("submits custom text on Enter key", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <AskUserQuestionInline
        questions={[singleSelectQuestion]}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByTestId("ask-question-other-trigger"));
    await user.type(screen.getByPlaceholderText("Type your response..."), "Custom{Enter}");

    expect(onSubmit).toHaveBeenCalledWith("Custom");
  });

  it("does not submit empty 'Other' text", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <AskUserQuestionInline
        questions={[singleSelectQuestion]}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByTestId("ask-question-other-trigger"));
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders multi-select with checkboxes and a Done button", () => {
    render(
      <AskUserQuestionInline
        questions={[multiSelectQuestion]}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByTestId("ask-question-done")).toBeInTheDocument();
    expect(screen.getByTestId("ask-question-done")).toBeDisabled();
  });

  it("collects multiple selections and submits on Done", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <AskUserQuestionInline
        questions={[multiSelectQuestion]}
        onSubmit={onSubmit}
      />,
    );

    const options = screen.getAllByTestId("ask-question-option");
    await user.click(options[0]);
    await user.click(options[1]);
    await user.click(screen.getByTestId("ask-question-done"));

    expect(onSubmit).toHaveBeenCalledWith("CRM sync, Email alerts");
  });

  it("toggles selection in multi-select mode", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <AskUserQuestionInline
        questions={[multiSelectQuestion]}
        onSubmit={onSubmit}
      />,
    );

    const options = screen.getAllByTestId("ask-question-option");
    // Select both, then deselect first
    await user.click(options[0]);
    await user.click(options[1]);
    await user.click(options[0]);
    await user.click(screen.getByTestId("ask-question-done"));

    expect(onSubmit).toHaveBeenCalledWith("Email alerts");
  });

  it("renders multiple questions", () => {
    render(
      <AskUserQuestionInline
        questions={[singleSelectQuestion, multiSelectQuestion]}
        onSubmit={vi.fn()}
      />,
    );

    const cards = screen.getAllByTestId("ask-question-card");
    expect(cards).toHaveLength(2);
  });
});
