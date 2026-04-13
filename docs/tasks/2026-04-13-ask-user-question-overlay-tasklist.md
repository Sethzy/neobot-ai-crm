# Ask User Question Overlay Widget Implementation Plan

**Goal:** Replace the inline `AskUserQuestionInline` component with a Claude.ai-style overlay widget that renders as a flex sibling between `MessageList` and `ChatComposer` in `chat-panel.tsx`.

**Architecture:** Extract pending-question detection from `message-bubble.tsx` into `chat-panel.tsx` via a `useMemo`. Build a new `AskUserQuestionOverlay` component that renders between the scroll area and the composer as a natural flex block. Remove inline rendering from `message-bubble.tsx` and delete the old component. The tool definition and `handleQuestionSubmit` callback are unchanged.

**Tech Stack:** React 19, Tailwind 4, ShadCN, Vitest, React Testing Library

---

## Bite-Sized Step Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

---

### Task 1: Extract pending question detection into chat-panel.tsx

**Context:** Currently, the `tool-ask_user_question` part is detected inside `message-bubble.tsx:236-251` and rendered inline. We need to detect it in `chat-panel.tsx` instead, so the overlay can be rendered at the panel level. The detection logic is: last assistant message has a part with `type === "tool-ask_user_question"` and `state === "output-available"`, and chat is not streaming.

**Files:**
- Modify: `src/components/chat/chat-panel.tsx:329-370`
- Modify: `src/components/chat/message-list.tsx:32-48` (remove `onQuestionSubmit` prop)
- Modify: `src/components/chat/message-bubble.tsx:36,50-51,236-251` (remove inline rendering)
- Modify: `src/components/chat/message-bubble.test.tsx:91-98,495-593` (remove ask_user_question tests)
- Delete: `src/components/chat/ask-user-question-inline.tsx`
- Delete: `src/components/chat/ask-user-question-inline.test.tsx`

**Step 1: Remove the ask_user_question branch from message-bubble.tsx**

In `src/components/chat/message-bubble.tsx`, delete the import and the rendering branch:

Remove line 36:
```tsx
// DELETE this line
import { AskUserQuestionInline, type AskUserQuestion } from "./ask-user-question-inline";
```

Remove lines 236-251 (the `if (part.type === "tool-ask_user_question" ...)` block). The tool call will now fall through to the generic `ToolCallInline` renderer at line 253.

**Step 2: Remove `onQuestionSubmit` prop from MessageBubble and MessageList**

In `src/components/chat/message-bubble.tsx`:
- Remove `onQuestionSubmit` from `MessageBubbleProps` interface (line 50-51)
- Remove it from the `MessageBubble` component's destructured params (line 100)

In `src/components/chat/message-list.tsx`:
- Remove `onQuestionSubmit` from `MessageListProps` interface (line 37-38)
- Remove it from the `MessageList` component's destructured params (line 48)
- Remove `onQuestionSubmit={isLastAssistantMessage ? onQuestionSubmit : undefined}` from the `MessageBubble` render (line 74)

In `src/components/chat/chat-panel.tsx`:
- Remove `onQuestionSubmit={handleQuestionSubmit}` from the `MessageList` render (line 370)

**Step 3: Update message-bubble.test.tsx**

Remove the entire `describe("MessageBubble -- ask_user_question", ...)` block (lines 494-593).

Remove the `vi.mock("./ask-user-question-inline", ...)` block (lines 91-98 area). Search for `ask-user-question-inline` in the test file and remove all references.

**Step 4: Delete old component files**

```bash
rm src/components/chat/ask-user-question-inline.tsx
rm src/components/chat/ask-user-question-inline.test.tsx
```

**Step 5: Add pending question detection to chat-panel.tsx**

In `src/components/chat/chat-panel.tsx`, add the `AskUserQuestion` type and detection logic. Place this `useMemo` near the other derived state (around line 327, before the `return`):

```tsx
// Import the type at the top of the file
import type { AskUserQuestion } from "./ask-user-question-overlay";

// Detection: extract pending questions from last assistant message
const pendingQuestions = useMemo<AskUserQuestion[] | null>(() => {
  if (effectiveStatus === "streaming") return null;
  const lastMsg = messages.at(-1);
  if (!lastMsg || lastMsg.role !== "assistant") return null;

  for (const part of (lastMsg as { parts?: unknown[] }).parts ?? []) {
    const p = part as { type?: string; state?: string; output?: { questions?: AskUserQuestion[] } };
    if (p.type === "tool-ask_user_question" && p.state === "output-available") {
      return p.output?.questions ?? null;
    }
  }
  return null;
}, [messages, effectiveStatus]);
```

**Step 6: Run existing tests to verify nothing is broken**

```bash
npx vitest run src/components/chat/message-bubble.test.tsx --reporter=verbose
npx vitest run src/components/chat/chat-panel.test.tsx --reporter=verbose
```

Expected: All remaining tests PASS. The ask_user_question tests are gone. No import errors.

**Step 7: Commit**

```bash
git add src/components/chat/message-bubble.tsx src/components/chat/message-bubble.test.tsx src/components/chat/message-list.tsx src/components/chat/chat-panel.tsx
git rm src/components/chat/ask-user-question-inline.tsx src/components/chat/ask-user-question-inline.test.tsx
git commit -m "refactor(chat): remove inline ask-user-question, extract detection to chat-panel"
```

---

### Task 2: Build AskUserQuestionOverlay component (single_select)

**Context:** The new overlay renders as a flex sibling between `MessageList` and `ChatComposer`. Start with `single_select` only — it's the most common type and matches the Claude.ai screenshot. The component receives `questions` and `onSubmit` props. The `onSubmit` callback sends a formatted user message via `handleQuestionSubmit` (unchanged).

**Key behavior (single_select):**
- Numbered options (1, 2, 3, 4) with arrow `>` on the right of the focused/hovered row
- Arrow keys move focus between options (roving tabindex)
- Enter selects the focused option and submits immediately (single question) or advances (multi-question)
- "Something else..." freetext input at bottom
- Skip button (skips current question, records null)
- Dismiss X (closes widget, no message sent)
- Pagination header for multi-question: `< 1 of 3 >` with X dismiss
- Keyboard hint bar at bottom: `arrow-up arrow-down to navigate . Enter to select . Esc to skip`

**Files:**
- Create: `src/components/chat/ask-user-question-overlay.tsx`
- Create: `src/components/chat/ask-user-question-overlay.test.tsx`

**Step 1: Write the test file with single_select basics**

Create `src/components/chat/ask-user-question-overlay.test.tsx`:

```tsx
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

  it("Escape triggers skip for single question (no message)", async () => {
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
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/chat/ask-user-question-overlay.test.tsx --reporter=verbose
```

Expected: FAIL — module not found.

**Step 3: Build the overlay component**

Create `src/components/chat/ask-user-question-overlay.tsx`:

```tsx
/**
 * Claude.ai-style overlay widget for the ask_user_question tool.
 * Renders as a flex sibling between MessageList and ChatComposer.
 * Supports single_select, multi_select, rank_priorities.
 * @module components/chat/ask-user-question-overlay
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface AskUserQuestion {
  question: string;
  options: string[];
  type: "single_select" | "multi_select" | "rank_priorities";
}

interface AskUserQuestionOverlayProps {
  questions: AskUserQuestion[];
  onSubmit: (text: string) => void;
  /** Called when user dismisses all questions (X button or Esc on last). */
  onDismiss?: () => void;
}

export function AskUserQuestionOverlay({
  questions,
  onSubmit,
  onDismiss,
}: AskUserQuestionOverlayProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<number, string | null>>(new Map());
  const [focusedOption, setFocusedOption] = useState(0);
  const [otherText, setOtherText] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const submittedRef = useRef(false);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const otherInputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const isMultiQuestion = questions.length > 1;
  const currentQuestion = questions[currentIndex];
  const isSingle = currentQuestion?.type === "single_select";

  /** Format collected Q&A pairs into the user message text. */
  const formatAndSubmit = useCallback(
    (finalAnswers: Map<number, string | null>) => {
      if (submittedRef.current) return;
      submittedRef.current = true;

      const lines: string[] = [];
      questions.forEach((q, i) => {
        const answer = finalAnswers.get(i);
        if (answer !== null && answer !== undefined) {
          lines.push(`Q: ${q.question}\nA: ${answer}`);
        }
      });

      if (lines.length === 0) return;
      onSubmit(lines.join("\n\n"));
    },
    [questions, onSubmit],
  );

  /** Record answer and advance or submit. */
  const handleAnswer = useCallback(
    (text: string) => {
      const next = new Map(answers);
      next.set(currentIndex, text);
      setAnswers(next);

      if (currentIndex < questions.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setFocusedOption(0);
        setOtherText("");
      } else {
        formatAndSubmit(next);
      }
    },
    [answers, currentIndex, questions.length, formatAndSubmit],
  );

  /** Skip current question. */
  const handleSkip = useCallback(() => {
    const next = new Map(answers);
    next.set(currentIndex, null);
    setAnswers(next);

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setFocusedOption(0);
      setOtherText("");
    } else {
      formatAndSubmit(next);
    }
  }, [answers, currentIndex, questions.length, formatAndSubmit]);

  /** Dismiss entire widget. */
  const handleDismiss = useCallback(() => {
    setDismissed(true);
    onDismiss?.();
  }, [onDismiss]);

  // Focus the active option when focusedOption changes
  useEffect(() => {
    optionRefs.current[focusedOption]?.focus();
  }, [focusedOption]);

  // Global keydown handler for navigation
  useEffect(() => {
    if (dismissed) return;

    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in the "Something else" input
      if (document.activeElement === otherInputRef.current) {
        if (e.key === "Escape") {
          otherInputRef.current?.blur();
          optionRefs.current[focusedOption]?.focus();
        }
        return;
      }

      const optionCount = currentQuestion?.options.length ?? 0;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          setFocusedOption((prev) => (prev + 1) % optionCount);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setFocusedOption((prev) => (prev - 1 + optionCount) % optionCount);
          break;
        }
        case "Enter": {
          e.preventDefault();
          if (isSingle && currentQuestion) {
            handleAnswer(currentQuestion.options[focusedOption]);
          }
          break;
        }
        case "Escape": {
          e.preventDefault();
          handleDismiss();
          break;
        }
        default: {
          // Number keys 1-9 for quick select
          const num = parseInt(e.key, 10);
          if (num >= 1 && num <= optionCount && isSingle && currentQuestion) {
            e.preventDefault();
            handleAnswer(currentQuestion.options[num - 1]);
          }
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dismissed, focusedOption, currentQuestion, isSingle, handleAnswer, handleDismiss]);

  if (dismissed || !currentQuestion) return null;

  return (
    <div
      ref={containerRef}
      data-testid="ask-question-overlay"
      className="mx-auto w-full max-w-[44rem] border-t border-border/50 bg-card px-4 pb-2 pt-3"
    >
      {/* Header: question text + pagination + dismiss */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{currentQuestion.question}</p>
        <div className="flex shrink-0 items-center gap-1">
          {isMultiQuestion && (
            <div data-testid="ask-question-pagination" className="flex items-center gap-1 text-xs text-muted-foreground">
              <button
                type="button"
                disabled={currentIndex === 0}
                className="px-0.5 disabled:opacity-30"
                onClick={() => { setCurrentIndex(currentIndex - 1); setFocusedOption(0); }}
                aria-label="Previous question"
              >
                &lsaquo;
              </button>
              <span>{currentIndex + 1} of {questions.length}</span>
              <button
                type="button"
                disabled={currentIndex === questions.length - 1}
                className="px-0.5 disabled:opacity-30"
                onClick={() => { setCurrentIndex(currentIndex + 1); setFocusedOption(0); }}
                aria-label="Next question"
              >
                &rsaquo;
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            className="ml-1 text-muted-foreground hover:text-foreground"
            data-testid="ask-question-dismiss"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Options list */}
      <div role="listbox" aria-label={currentQuestion.question} className="flex flex-col gap-1">
        {currentQuestion.options.map((option, index) => (
          <button
            key={option}
            ref={(el) => { optionRefs.current[index] = el; }}
            type="button"
            role="option"
            aria-selected={focusedOption === index}
            tabIndex={focusedOption === index ? 0 : -1}
            data-testid="ask-question-option"
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
              focusedOption === index
                ? "border-primary/40 bg-primary/5"
                : "border-border/50 bg-background hover:border-border hover:bg-secondary/30",
            )}
            onClick={() => {
              if (isSingle) {
                handleAnswer(option);
              }
            }}
            onMouseEnter={() => setFocusedOption(index)}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
              {index + 1}
            </span>
            <span className="flex-1">{option}</span>
            {focusedOption === index && (
              <span className="text-muted-foreground">&rsaquo;</span>
            )}
          </button>
        ))}
      </div>

      {/* Something else + Skip row */}
      <div className="mt-2 flex items-center gap-2">
        <div className="relative flex-1">
          <input
            ref={otherInputRef}
            type="text"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="Something else"
            data-testid="ask-question-other-input"
            className="h-9 w-full rounded-md border border-border/50 bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && otherText.trim().length > 0) {
                e.preventDefault();
                handleAnswer(otherText.trim());
              }
            }}
          />
        </div>
        <button
          type="button"
          onClick={handleSkip}
          className="text-sm text-muted-foreground hover:text-foreground"
          data-testid="ask-question-skip"
        >
          Skip
        </button>
      </div>

      {/* Keyboard hints */}
      <div
        data-testid="ask-question-hints"
        className="mt-2 flex items-center justify-center gap-3 text-[11px] text-muted-foreground/60"
      >
        <span>&#8593;&#8595; to navigate</span>
        <span>&middot;</span>
        <span>Enter to select</span>
        <span>&middot;</span>
        <span>Esc to skip</span>
      </div>
    </div>
  );
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/chat/ask-user-question-overlay.test.tsx --reporter=verbose
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/components/chat/ask-user-question-overlay.tsx src/components/chat/ask-user-question-overlay.test.tsx
git commit -m "feat(chat): add AskUserQuestionOverlay component (single_select)"
```

---

### Task 3: Add multi_select and rank_priorities support

**Context:** The overlay already handles `single_select`. Now extend it for `multi_select` (checkboxes, counter, no Skip) and `rank_priorities` (drag-to-reorder, numbered). These match the behavior from the old inline component.

**Files:**
- Modify: `src/components/chat/ask-user-question-overlay.tsx`
- Modify: `src/components/chat/ask-user-question-overlay.test.tsx`

**Step 1: Add multi_select tests**

Append to the test file:

```tsx
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
```

**Step 2: Run tests, verify they fail**

```bash
npx vitest run src/components/chat/ask-user-question-overlay.test.tsx --reporter=verbose
```

Expected: FAIL — new tests fail.

**Step 3: Implement multi_select rendering**

In `ask-user-question-overlay.tsx`, extend the component to handle `multi_select`:

- Add `selectedChecks` state: `const [selectedChecks, setSelectedChecks] = useState<string[]>([]);`
- Add `isMulti` derived: `const isMulti = currentQuestion?.type === "multi_select";`
- For `multi_select` options: render with checkbox indicator, toggle on click instead of immediate submit
- Show "N selected" counter when > 0 selections
- Show "Continue" button instead of Skip for multi_select
- Continue is disabled when no selections

The specific rendering for multi_select options uses the same option list structure but:
- Click toggles selection instead of submitting
- Left side shows a checkbox indicator instead of a number
- Footer shows counter + Continue instead of Skip

**Step 4: Add rank_priorities tests**

```tsx
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
```

**Step 5: Implement rank_priorities rendering**

- Add `rankedItems` state: `const [rankedItems, setRankedItems] = useState<string[]>(currentQuestion.options);`
- Add `isRank` derived: `const isRank = currentQuestion?.type === "rank_priorities";`
- Render with drag handles (`⠿`) and numbered items
- Show Continue + Skip footer (same as single_select but Continue always enabled)
- No "Something else" input for rank

**Step 6: Run all overlay tests**

```bash
npx vitest run src/components/chat/ask-user-question-overlay.test.tsx --reporter=verbose
```

Expected: All tests PASS.

**Step 7: Commit**

```bash
git add src/components/chat/ask-user-question-overlay.tsx src/components/chat/ask-user-question-overlay.test.tsx
git commit -m "feat(chat): add multi_select and rank_priorities to overlay"
```

---

### Task 4: Add multi-question pagination tests and behavior

**Context:** When `questions.length > 1`, the overlay shows `< 1 of N >` pagination, advances on answer/skip, and only submits the combined message after the last question.

**Files:**
- Modify: `src/components/chat/ask-user-question-overlay.test.tsx`
- Modify: `src/components/chat/ask-user-question-overlay.tsx` (if not already covered)

**Step 1: Add pagination tests**

```tsx
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
```

**Step 2: Run tests**

```bash
npx vitest run src/components/chat/ask-user-question-overlay.test.tsx --reporter=verbose
```

Expected: PASS (pagination logic was built in Task 2).

**Step 3: Commit**

```bash
git add src/components/chat/ask-user-question-overlay.test.tsx
git commit -m "test(chat): add pagination tests for ask-user-question overlay"
```

---

### Task 5: Wire overlay into chat-panel.tsx and disable composer

**Context:** The detection `useMemo` was added in Task 1. Now render the overlay between `MessageList` and `ChatComposer`, and pass `disabled={true}` to the composer when the overlay is active. The `ChatComposer` already supports a `disabled` prop (see `src/components/chat/chat-composer.tsx:54`).

**Files:**
- Modify: `src/components/chat/chat-panel.tsx:355-370`

**Step 1: Import the overlay and wire it up**

In `src/components/chat/chat-panel.tsx`, add the import at the top:

```tsx
import { AskUserQuestionOverlay } from "./ask-user-question-overlay";
```

In the render, between `MessageList` and `ChatComposer` (around line 370):

```tsx
{hasMessages ? (
  <>
    <MessageList ref={messageListRef} messages={messages} status={effectiveStatus} onToolApproval={handleToolApproval} />
    {pendingQuestions && (
      <AskUserQuestionOverlay
        questions={pendingQuestions}
        onSubmit={handleQuestionSubmit}
      />
    )}
    {messageQuota ? (
      <MessageQuotaPill quota={messageQuota} className="pb-1 pt-2" />
    ) : null}
    <ChatComposer
      status={effectiveStatus}
      selectedChatModel={selectedChatModel}
      value={composerValue}
      onValueChange={setComposerValue}
      onSelectedChatModelChange={handleModelChange}
      onSubmit={handleSubmit}
      onStop={effectiveStatus === "streaming" ? handleStop : undefined}
      disabled={!!pendingQuestions || (messageQuota?.messagesRemaining ?? 1) <= 0}
      hideModelSelector
    />
  </>
) : (
  // ... ChatWelcome unchanged
)}
```

Note: the `disabled` prop on `ChatComposer` now also checks `!!pendingQuestions`. This grays out the composer while the overlay is active.

**Step 2: Run the full chat test suite**

```bash
npx vitest run src/components/chat/ --reporter=verbose
```

Expected: All tests PASS.

**Step 3: Manual test in the browser**

Start the dev server:

```bash
npm run dev
```

1. Open a chat thread
2. Ask the agent to use `ask_user_question` (e.g., trigger onboarding or say "ask me about my role")
3. Verify the overlay appears between the message list and the composer
4. Verify the composer is grayed out / disabled
5. Click an option — verify it submits and the overlay disappears
6. Verify the composer re-enables after submission
7. Test keyboard navigation: arrow keys, Enter, Esc
8. Test "Something else" freetext
9. Test multi-question pagination if possible

**Step 4: Commit**

```bash
git add src/components/chat/chat-panel.tsx
git commit -m "feat(chat): wire ask-user-question overlay into chat panel, disable composer while active"
```

---

## Relevant Files

| File | Action | Purpose |
|---|---|---|
| `src/components/chat/ask-user-question-overlay.tsx` | Create | New overlay component |
| `src/components/chat/ask-user-question-overlay.test.tsx` | Create | Tests for overlay |
| `src/components/chat/chat-panel.tsx` | Modify | Pending question detection + render overlay + disable composer |
| `src/components/chat/message-bubble.tsx` | Modify | Remove inline ask_user_question rendering + `onQuestionSubmit` prop |
| `src/components/chat/message-bubble.test.tsx` | Modify | Remove ask_user_question test block |
| `src/components/chat/message-list.tsx` | Modify | Remove `onQuestionSubmit` prop passthrough |
| `src/components/chat/ask-user-question-inline.tsx` | Delete | Old inline component |
| `src/components/chat/ask-user-question-inline.test.tsx` | Delete | Old inline tests |

---

## Notes

- The `AskUserQuestion` type interface is identical to the old one — the tool definition is unchanged.
- The `handleQuestionSubmit` callback in `chat-panel.tsx` is unchanged — it still calls `handleSubmit({ text, files: [] })`.
- The `ChatComposer` already has a `disabled` prop. No changes needed to the composer itself.
- The overlay uses `max-w-[44rem]` to match the `MessageList`'s `ConversationContent` width.
- No receipt/collapsed card needed — the user's answer shows as a regular user message, and the tool call shows as a collapsed `ToolCallInline`.
