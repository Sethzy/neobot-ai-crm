import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AskUserQuestionOverlay, type AskUserQuestion } from "./ask-user-question-overlay";

const singleQ: AskUserQuestion = {
  question: "What's your primary role or job?",
  options: [
    "Sales or Business Development",
    "Engineering or Development",
    "Product, Strategy, or Operations",
    "Creative, Design, or Other",
  ],
  type: "single_select",
};

describe("AskUserQuestionOverlay — single_select", () => {
  it("renders question text and all numbered options", () => {
    render(<AskUserQuestionOverlay questions={[singleQ]} onSubmit={vi.fn()} />);

    expect(screen.getByText("What's your primary role or job?")).toBeInTheDocument();
    expect(screen.getByText("Sales or Business Development")).toBeInTheDocument();
    expect(screen.getByText("Engineering or Development")).toBeInTheDocument();
    expect(screen.getByText("Product, Strategy, or Operations")).toBeInTheDocument();
    expect(screen.getByText("Creative, Design, or Other")).toBeInTheDocument();
    // Numbered labels
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("clicking an option submits immediately for single question", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionOverlay questions={[singleQ]} onSubmit={onSubmit} />);
    await user.click(screen.getByText("Engineering or Development"));

    expect(onSubmit).toHaveBeenCalledWith(
      "Q: What's your primary role or job?\nA: Engineering or Development",
    );
  });

  it("shows Skip button", () => {
    render(<AskUserQuestionOverlay questions={[singleQ]} onSubmit={vi.fn()} />);
    expect(screen.getByText("Skip")).toBeInTheDocument();
  });

  it("shows Something else input", () => {
    render(<AskUserQuestionOverlay questions={[singleQ]} onSubmit={vi.fn()} />);
    expect(screen.getByPlaceholderText("Something else")).toBeInTheDocument();
  });

  it("Something else submits on Enter", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionOverlay questions={[singleQ]} onSubmit={onSubmit} />);
    await user.type(screen.getByPlaceholderText("Something else"), "Consulting{Enter}");

    expect(onSubmit).toHaveBeenCalledWith(
      "Q: What's your primary role or job?\nA: Consulting",
    );
  });

  it("keyboard: ArrowDown moves focus, Enter selects", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionOverlay questions={[singleQ]} onSubmit={onSubmit} />);
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(onSubmit).toHaveBeenCalledWith(
      "Q: What's your primary role or job?\nA: Engineering or Development",
    );
  });

  it("Escape triggers dismiss", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onDismiss = vi.fn();

    render(<AskUserQuestionOverlay questions={[singleQ]} onSubmit={onSubmit} onDismiss={onDismiss} />);
    await user.keyboard("{Escape}");

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });

  it("no pagination header for single question", () => {
    render(<AskUserQuestionOverlay questions={[singleQ]} onSubmit={vi.fn()} />);
    expect(screen.queryByTestId("ask-question-pagination")).not.toBeInTheDocument();
  });

  it("shows keyboard hint bar", () => {
    render(<AskUserQuestionOverlay questions={[singleQ]} onSubmit={vi.fn()} />);
    expect(screen.getByTestId("ask-question-hints")).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  multi_select                                                       */
/* ------------------------------------------------------------------ */

const multiQ: AskUserQuestion = {
  question: "Which sections should the article include?",
  options: ["Code examples", "Architecture diagrams", "Comparison table", "Further reading"],
  type: "multi_select",
};

describe("AskUserQuestionOverlay — multi_select", () => {
  it("renders checkboxes and does not submit on single click", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionOverlay questions={[multiQ]} onSubmit={onSubmit} />);
    await user.click(screen.getByText("Code examples"));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId("ask-question-counter")).toHaveTextContent("1 selected");
  });

  it("has no Skip button", () => {
    render(<AskUserQuestionOverlay questions={[multiQ]} onSubmit={vi.fn()} />);
    expect(screen.queryByTestId("ask-question-skip")).not.toBeInTheDocument();
  });

  it("Continue submits selected options", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionOverlay questions={[multiQ]} onSubmit={onSubmit} />);
    await user.click(screen.getByText("Code examples"));
    await user.click(screen.getByText("Comparison table"));
    await user.click(screen.getByTestId("ask-question-continue"));

    expect(onSubmit).toHaveBeenCalledWith(
      "Q: Which sections should the article include?\nA: Code examples, Comparison table",
    );
  });

  it("Continue is disabled until an option is selected", () => {
    render(<AskUserQuestionOverlay questions={[multiQ]} onSubmit={vi.fn()} />);
    expect(screen.getByTestId("ask-question-continue")).toBeDisabled();
  });
});

/* ------------------------------------------------------------------ */
/*  rank_priorities                                                    */
/* ------------------------------------------------------------------ */

const rankQ: AskUserQuestion = {
  question: "Rank these by importance to you",
  options: ["Response speed", "Accuracy", "Cost efficiency"],
  type: "rank_priorities",
};

describe("AskUserQuestionOverlay — rank_priorities", () => {
  it("renders numbered items", () => {
    render(<AskUserQuestionOverlay questions={[rankQ]} onSubmit={vi.fn()} />);

    expect(screen.getByText("Response speed")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("has Skip button and no Something else input", () => {
    render(<AskUserQuestionOverlay questions={[rankQ]} onSubmit={vi.fn()} />);
    expect(screen.getByTestId("ask-question-skip")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Something else")).not.toBeInTheDocument();
  });

  it("Continue submits ranked order", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionOverlay questions={[rankQ]} onSubmit={onSubmit} />);
    await user.click(screen.getByTestId("ask-question-continue"));

    expect(onSubmit).toHaveBeenCalledWith(
      "Q: Rank these by importance to you\nA: 1. Response speed, 2. Accuracy, 3. Cost efficiency",
    );
  });
});

/* ------------------------------------------------------------------ */
/*  pagination                                                         */
/* ------------------------------------------------------------------ */

describe("AskUserQuestionOverlay — pagination", () => {
  it("shows pagination header for multi-question", () => {
    render(<AskUserQuestionOverlay questions={[singleQ, multiQ]} onSubmit={vi.fn()} />);

    expect(screen.getByTestId("ask-question-pagination")).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
  });

  it("answering Q1 advances to Q2", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionOverlay questions={[singleQ, multiQ]} onSubmit={onSubmit} />);
    await user.click(screen.getByText("Sales or Business Development"));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Which sections should the article include?")).toBeInTheDocument();
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
  });

  it("answering last question submits all Q&A pairs", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionOverlay questions={[singleQ, multiQ]} onSubmit={onSubmit} />);

    // Answer Q1
    await user.click(screen.getByText("Sales or Business Development"));

    // Answer Q2
    await user.click(screen.getByText("Code examples"));
    await user.click(screen.getByTestId("ask-question-continue"));

    expect(onSubmit).toHaveBeenCalledWith(
      "Q: What's your primary role or job?\nA: Sales or Business Development\n\nQ: Which sections should the article include?\nA: Code examples",
    );
  });

  it("skipped questions are omitted from final message", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionOverlay questions={[singleQ, multiQ]} onSubmit={onSubmit} />);

    // Skip Q1
    await user.click(screen.getByText("Skip"));

    // Answer Q2
    await user.click(screen.getByText("Code examples"));
    await user.click(screen.getByTestId("ask-question-continue"));

    expect(onSubmit).toHaveBeenCalledWith(
      "Q: Which sections should the article include?\nA: Code examples",
    );
  });

  it("dismiss closes widget without submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<AskUserQuestionOverlay questions={[singleQ, multiQ]} onSubmit={onSubmit} />);
    await user.click(screen.getByTestId("ask-question-dismiss"));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByTestId("ask-question-overlay")).not.toBeInTheDocument();
  });
});
