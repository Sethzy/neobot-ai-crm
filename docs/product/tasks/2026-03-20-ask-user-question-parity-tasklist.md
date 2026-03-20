# Ask User Question — Claude.ai Parity

**Goal:** Align our `ask_user_question` tool + UI with Anthropic's `ask_user_input_v0` — schema, interaction patterns, and UI chrome — so the experience matches claude.ai exactly.

**Out-of-plan:** No v2 plan PR covers this. Enhancement to existing ask_user_question feature (shipped in Phase 1).

**Architecture:** We adopt Anthropic's schema wholesale — string-only options, `type` enum, no `header`, max 3 questions. We keep the tool name `ask_user_question` (already wired through message-bubble, system prompt, runner). The UI matches claude.ai's exact per-type behavior matrix (see below).

**Anthropic's exact schema (reference):**

```json
{
  "name": "ask_user_input_v0",
  "parameters": {
    "properties": {
      "questions": {
        "description": "1-3 questions to ask the user",
        "items": {
          "properties": {
            "options": {
              "description": "2-4 options with short labels",
              "items": { "type": "string" },
              "minItems": 2, "maxItems": 4
            },
            "question": { "type": "string" },
            "type": {
              "default": "single_select",
              "enum": ["single_select", "multi_select", "rank_priorities"]
            }
          },
          "required": ["question", "options"]
        },
        "minItems": 1, "maxItems": 3
      }
    }
  }
}
```

**Per-type behavior matrix (from Anthropic dev):**

| Feature | single_select | multi_select | rank_priorities |
|---------|---------------|--------------|-----------------|
| Controls | Radio buttons (○/●) | Checkboxes (☐/☑) | Drag handles (⠿) + numbered |
| Multi-pick | No | Yes | Yes (ordered) |
| Counter | No | Yes ("N selected") | No |
| Cmd+Enter shortcut | No | Yes | No |
| "Something else..." | Yes | Yes | **No** |
| Skip button | Yes | **No** | Yes |

**UI chrome (added by frontend, not the tool):**

| Element | Behavior |
|---------|----------|
| "Something else..." | Always-visible text input. **single_select and multi_select only.** Not shown for rank_priorities. |
| Skip | Bottom left. Esc key shortcut. **single_select and rank_priorities only.** Not shown for multi_select (counter replaces it). |
| Continue → | Bottom right. Confirms selection and advances to next question or closes widget if last. |
| Dismiss X | Top right in pagination header. **Closes entire widget silently — no answer recorded, no message sent.** |
| Pagination | "Question N of M" + dot indicators (●○○) + `‹ ›` arrows. Only for 2-3 questions. |
| Selection counter | "N selected · Cmd+Enter to submit" for multi_select only. Replaces Skip button. |

**Answer format in chat:**

```
Q: [question text]
A: [answer]

Q: [question text]
A: [answer]
```

- Format: `Q: [question text]\nA: [answer]` for each question, stacked in one bubble.
- **Skipped questions do not appear** — they are omitted entirely from the message.
- Rank answers: `1. X, 2. Y, 3. Z` (no "Ranked:" prefix).
- Dismiss X sends **no message at all** — widget just disappears.

**Tech Stack:** React state machine, Tailwind, HTML5 drag-and-drop (for rank_priorities), Vitest + RTL.

---

## Bite-Sized Step Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step
- "Commit" — step

---

## Relevant Files

| File | Action | Task |
|------|--------|------|
| `src/lib/runner/tools/utility/ask-user-question.ts` | Rewrite schema | 1 |
| `src/lib/runner/tools/utility/__tests__/ask-user-question.test.ts` | Update | 1 |
| `src/components/chat/ask-user-question-inline.tsx` | Rewrite | 2, 3, 4 |
| `src/components/chat/ask-user-question-inline.test.tsx` | Rewrite | 2, 3, 4 |
| `src/components/chat/message-bubble.tsx` | Minor update | 2 |
| `src/components/chat/message-bubble.test.tsx` | Update fixtures | 5 |
| `src/components/chat/chat-panel.tsx` | No change | — |
| `src/components/chat/chat-panel.test.tsx` | Update assertion | 5 |
| `src/lib/ai/system-prompt.ts` | Update guidance | 6 |

---

## Current vs Target

```
                    CURRENT                              TARGET (claude.ai parity)
─────────────────────────────────────────────────────────────────────────────────
Questions           .max(1)                              .max(3)
Options             { label, description }               string[] (short labels)
Question type       multiSelect: boolean                 type: single_select | multi_select | rank_priorities
Header badge        header: string (max 12)              Removed
single_select       Flat buttons, click = immediate      Radio buttons (○/●) + "Continue →"
multi_select        Checkboxes + "Done" button           Checkboxes + counter + Cmd+Enter + "Continue →"
rank_priorities     N/A                                  Drag-to-reorder with handles (⠿) + numbered
"Something else"    Hidden behind dashed trigger btn     Always visible (single + multi only, NOT rank)
Skip                None                                 "Skip" (single + rank only, NOT multi)
Confirm             Immediate (single) / "Done" (multi)  "Continue →" bottom-right on all types
Pagination          N/A (max 1 question)                 "Question N of M" + dot indicators + ‹ › arrows
Dismiss             None                                 X closes silently — no message sent
Submit format       Raw answer text ("PDF")              Q&A pairs, skipped questions omitted
Tool description    Brief                                Anthropic's prescriptive guidance
```

---

### Task 1: Rewrite tool schema to match Anthropic's

**Why:** Our schema uses `{ label, description }` options, `multiSelect` boolean, and `header` field. Anthropic uses flat string options, a `type` enum with 3 modes, no header, and max 3 questions. We adopt their shape.

**Files:**
- Rewrite: `src/lib/runner/tools/utility/ask-user-question.ts`
- Update: `src/lib/runner/tools/utility/__tests__/ask-user-question.test.ts`

**Step 1: Rewrite the tool file**

Replace the entire contents of `src/lib/runner/tools/utility/ask-user-question.ts`:

```typescript
/**
 * ask_user_question tool for structured user input during agent runs.
 * Schema aligned with Anthropic's ask_user_input_v0: string options, type enum, 1-3 questions.
 * The execute function echoes questions back — the UI renders interactive widgets.
 * @module lib/runner/tools/utility/ask-user-question
 */
import { tool } from "ai";
import { z } from "zod";

const questionSchema = z.object({
  question: z
    .string()
    .describe("The question text shown to the user."),
  options: z
    .array(z.string().describe("Short label"))
    .min(2)
    .max(4)
    .describe("2-4 options with short, self-explanatory labels."),
  type: z
    .enum(["single_select", "multi_select", "rank_priorities"])
    .default("single_select")
    .describe(
      "Question type: 'single_select' for choosing 1 option, " +
      "'multi_select' for choosing 1 or more options, " +
      "'rank_priorities' for drag-and-drop ranking between options.",
    ),
});

/**
 * Creates the ask_user_question tool. Stateless — no DB or client context needed.
 */
export function createAskUserQuestionTool() {
  const ask_user_question = tool({
    description:
      "USE THIS TOOL WHENEVER YOU HAVE A QUESTION FOR THE USER. Instead of asking questions in prose, " +
      "present options as clickable choices. Your questions will be presented to the user as a widget in chat.\n\n" +
      "USE THIS TOOL WHEN:\n" +
      "- User asks a question with 2-10 reasonable answers\n" +
      "- You need clarification to proceed\n" +
      "- Ranking or prioritization would help\n" +
      "- User says 'which should I...' or 'what do you recommend...'\n" +
      "- User asks for a recommendation across a broad area needing refinement\n\n" +
      "HOW TO USE:\n" +
      "- Always include a brief conversational message before calling this tool\n" +
      "- Generally prefer multi_select — users may have multiple preferences\n" +
      "- Use short, self-explanatory labels (no descriptions needed)\n" +
      "- Collect all info needed up front rather than spreading over multiple turns\n" +
      "- Prefer 1-3 questions with up to 4 options each\n\n" +
      "SKIP THIS TOOL WHEN:\n" +
      "- Question is open-ended (names, descriptions, free feedback)\n" +
      "- User is clearly venting, not seeking choices\n" +
      "- Context makes the right choice obvious\n" +
      "- User explicitly asked to discuss options in prose",
    inputSchema: z.object({
      questions: z.array(questionSchema).min(1).max(3),
    }),
    execute: async ({ questions }) => {
      // Echo questions back as output — the UI renders them as interactive widgets.
      // The user's response arrives as a new chat message on the next turn.
      return { questions, status: "awaiting_response" as const };
    },
  });

  return { ask_user_question };
}
```

**Step 2: Run existing tool test (expect failures)**

```bash
npx vitest run src/lib/runner/tools/utility/__tests__/ask-user-question.test.ts --reporter=verbose
```

Expected: Fails — test fixtures use `{ label, description }` options and `multiSelect` boolean.

**Step 3: Rewrite the tool test**

Replace `src/lib/runner/tools/utility/__tests__/ask-user-question.test.ts`:

```typescript
/**
 * Tests for the ask_user_question tool.
 * @module lib/runner/tools/utility/__tests__/ask-user-question.test
 */
import { describe, expect, it } from "vitest";

import { createAskUserQuestionTool } from "../ask-user-question";

describe("createAskUserQuestionTool", () => {
  it("echoes a single question back with awaiting_response status", async () => {
    const { ask_user_question } = createAskUserQuestionTool();
    const questions = [
      {
        question: "Which format?",
        options: ["Markdown", "PDF", "CSV"],
        type: "single_select" as const,
      },
    ];
    const result = await (
      ask_user_question as {
        execute: (args: { questions: typeof questions }) => Promise<{
          questions: typeof questions;
          status: string;
        }>;
      }
    ).execute({ questions });

    expect(result.questions).toEqual(questions);
    expect(result.status).toBe("awaiting_response");
  });

  it("accepts up to 3 questions and echoes them all back", async () => {
    const { ask_user_question } = createAskUserQuestionTool();
    const questions = [
      { question: "Q1?", options: ["A", "B"], type: "single_select" as const },
      { question: "Q2?", options: ["C", "D"], type: "multi_select" as const },
      { question: "Q3?", options: ["E", "F", "G"], type: "rank_priorities" as const },
    ];
    const result = await (
      ask_user_question as {
        execute: (args: { questions: typeof questions }) => Promise<{
          questions: typeof questions;
          status: string;
        }>;
      }
    ).execute({ questions });

    expect(result.questions).toHaveLength(3);
    expect(result.status).toBe("awaiting_response");
  });
});
```

**Step 4: Run tests**

```bash
npx vitest run src/lib/runner/tools/utility/__tests__/ask-user-question.test.ts --reporter=verbose
```

Expected: All pass.

**Step 5: Commit**

```bash
git add src/lib/runner/tools/utility/ask-user-question.ts src/lib/runner/tools/utility/__tests__/ask-user-question.test.ts
git commit -m "feat(ask-user): rewrite schema to match Anthropic ask_user_input_v0"
```

---

### Task 2: Rewrite UI component — full claude.ai parity

**Why:** The component needs a complete rewrite. Key per-type behaviors from the Anthropic dev:
- **multi_select:** No Skip button (counter replaces it). Has Cmd+Enter shortcut.
- **rank_priorities:** No "Something else..." (only predefined items can be ranked). Has Skip.
- **Dismiss X:** Closes widget silently — no message sent, no answer recorded.
- **Skipped questions:** Omitted from the user message entirely (not `A: Skipped`).
- **Rank format:** `1. X, 2. Y` (no `Ranked:` prefix).

**Files:**
- Rewrite: `src/components/chat/ask-user-question-inline.tsx`
- Minor update: `src/components/chat/message-bubble.tsx` (type import)

**Step 1: Rewrite the component interfaces**

```typescript
export interface AskUserQuestion {
  question: string;
  options: string[];
  type: "single_select" | "multi_select" | "rank_priorities";
}
```

Remove `AskUserQuestionOption` — no longer needed.

**Step 2: Rewrite QuestionCard**

Key per-type differences in the card:
- **"Something else..."** shown for `single_select` and `multi_select` only, NOT `rank_priorities`
- **Skip button** shown for `single_select` and `rank_priorities` only, NOT `multi_select`
- **Selection counter** shown for `multi_select` only (replaces Skip)
- **Cmd+Enter** triggers Continue for `multi_select`
- **Rank format:** `1. X, 2. Y` (no "Ranked:" prefix)

```typescript
function QuestionCard({
  question,
  onSubmit,
  onSkip,
  disabled,
}: {
  question: AskUserQuestion;
  onSubmit: (text: string) => void;
  onSkip?: () => void;
  disabled: boolean;
}) {
  const [selectedRadio, setSelectedRadio] = useState<string | null>(null);
  const [selectedChecks, setSelectedChecks] = useState<string[]>([]);
  const [rankedItems, setRankedItems] = useState<string[]>(question.options);
  const [otherText, setOtherText] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const isSingle = question.type === "single_select";
  const isMulti = question.type === "multi_select";
  const isRank = question.type === "rank_priorities";

  const showSomethingElse = !isRank && !disabled;
  const showSkip = !isMulti && !disabled && !!onSkip;
  const showCounter = isMulti && !disabled && selectedChecks.length > 0;

  /** Submit the current selection via "Continue →". */
  const handleContinue = () => {
    // "Something else" overrides if the user typed something (single/multi only)
    const otherTrimmed = otherText.trim();
    if (otherTrimmed.length > 0 && !isRank) {
      onSubmit(otherTrimmed);
      return;
    }

    if (isSingle) {
      if (!selectedRadio) return;
      onSubmit(selectedRadio);
    } else if (isMulti) {
      if (selectedChecks.length === 0) return;
      onSubmit(selectedChecks.join(", "));
    } else if (isRank) {
      const ranked = rankedItems.map((o, i) => `${i + 1}. ${o}`).join(", ");
      onSubmit(ranked);
    }
  };

  const handleMultiToggle = (option: string) => {
    setSelectedChecks((prev) =>
      prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option],
    );
  };

  // ─── Drag-and-drop handlers for rank_priorities ──────────────
  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const reordered = [...rankedItems];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(index, 0, moved);
    setRankedItems(reordered);
    setDragIndex(index);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  // Determine if "Continue →" should be enabled
  const canContinue =
    (otherText.trim().length > 0 && !isRank) ||
    (isSingle && selectedRadio !== null) ||
    (isMulti && selectedChecks.length > 0) ||
    isRank; // rank always has an ordering

  return (
    <div
      data-testid="ask-question-card"
      className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2.5"
    >
      <p className="text-sm font-medium text-foreground">{question.question}</p>

      <div className="flex flex-col gap-1.5">
        {/* ─── single_select: radio buttons ─────────────────────── */}
        {isSingle &&
          question.options.map((option) => (
            <label
              key={option}
              data-testid="ask-question-option"
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors",
                disabled
                  ? "cursor-default border-border/30 bg-muted/20 text-muted-foreground"
                  : selectedRadio === option
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/50 bg-background hover:border-border hover:bg-secondary/30",
              )}
              onClick={(e) => {
                e.preventDefault();
                if (!disabled) setSelectedRadio(option);
              }}
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                  selectedRadio === option
                    ? "border-primary"
                    : "border-muted-foreground/40",
                )}
              >
                {selectedRadio === option && (
                  <span className="h-2 w-2 rounded-full bg-primary" />
                )}
              </span>
              <span>{option}</span>
            </label>
          ))}

        {/* ─── multi_select: checkboxes ─────────────────────────── */}
        {isMulti &&
          question.options.map((option) => {
            const isChecked = selectedChecks.includes(option);
            return (
              <label
                key={option}
                data-testid="ask-question-option"
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors",
                  disabled
                    ? "cursor-default border-border/30 bg-muted/20 text-muted-foreground"
                    : isChecked
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/50 bg-background hover:border-border hover:bg-secondary/30",
                )}
                onClick={(e) => {
                  e.preventDefault();
                  if (!disabled) handleMultiToggle(option);
                }}
              >
                <Checkbox
                  checked={isChecked}
                  disabled={disabled}
                  className="pointer-events-none"
                  tabIndex={-1}
                />
                <span>{option}</span>
              </label>
            );
          })}

        {/* ─── rank_priorities: drag-to-reorder ─────────────────── */}
        {isRank &&
          rankedItems.map((option, index) => (
            <div
              key={option}
              data-testid="ask-question-option"
              draggable={!disabled}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={cn(
                "flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors",
                disabled
                  ? "cursor-default border-border/30 bg-muted/20 text-muted-foreground"
                  : "border-border/50 bg-background hover:border-border hover:bg-secondary/30",
                dragIndex === index && "opacity-50",
                !disabled && "cursor-grab active:cursor-grabbing",
              )}
            >
              {!disabled && (
                <span className="text-muted-foreground/50 select-none" aria-hidden>⠿</span>
              )}
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                {index + 1}
              </span>
              <span>{option}</span>
            </div>
          ))}

        {/* ─── "Something else..." — single_select + multi_select only ── */}
        {showSomethingElse && (
          <Input
            data-testid="ask-question-other-input"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="Something else..."
            className="text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && otherText.trim().length > 0) {
                e.preventDefault();
                handleContinue();
              }
            }}
          />
        )}
      </div>

      {/* ─── Counter — multi_select only (replaces Skip) ────────── */}
      {showCounter && (
        <p className="text-xs text-muted-foreground" data-testid="ask-question-counter">
          {selectedChecks.length} selected · Cmd+Enter to submit
        </p>
      )}

      {/* ─── Footer: Skip + Continue → ──────────────────────────── */}
      {!disabled && (
        <div
          className="flex items-center justify-between"
          onKeyDown={(e) => {
            // Cmd+Enter shortcut for multi_select
            if (isMulti && e.key === "Enter" && (e.metaKey || e.ctrlKey) && canContinue) {
              e.preventDefault();
              handleContinue();
            }
          }}
        >
          {showSkip ? (
            <Button
              size="sm"
              variant="ghost"
              data-testid="ask-question-skip"
              onClick={onSkip}
            >
              Skip
            </Button>
          ) : (
            <div />
          )}
          <Button
            size="sm"
            data-testid="ask-question-continue"
            disabled={!canContinue}
            onClick={handleContinue}
          >
            Continue →
          </Button>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Rewrite AskUserQuestionInline with stepper + corrected behaviors**

Key behavior corrections:
- **Dismiss X:** `setDismissed(true)` only — NO `formatAndSubmit`, no message sent.
- **`formatAndSubmit`:** Filter out null answers (skipped questions omitted from message).
- **`showSkip` per question type:** Not passed as a blanket prop — the QuestionCard handles it internally based on `question.type`.
- **Esc handler:** Only fires skip for single_select and rank_priorities (not multi_select).

```typescript
export function AskUserQuestionInline({
  questions,
  onSubmit,
  disabled = false,
}: AskUserQuestionInlineProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<number, string | null>>(new Map());
  const [dismissed, setDismissed] = useState(false);
  const isMultiQuestion = questions.length > 1;
  const currentQuestion = questions[currentIndex];

  // Disabled mode: show all questions stacked (non-interactive)
  if (disabled) {
    return (
      <div data-testid="ask-user-question-inline" className="space-y-2">
        {questions.map((q, i) => (
          <QuestionCard
            key={`q-${i}`}
            question={q}
            onSubmit={() => {}}
            disabled
          />
        ))}
      </div>
    );
  }

  /**
   * Format collected Q&A pairs into the user message text.
   * Skipped questions (null answers) are omitted entirely.
   */
  const formatAndSubmit = (finalAnswers: Map<number, string | null>) => {
    const lines: string[] = [];
    questions.forEach((q, i) => {
      const answer = finalAnswers.get(i);
      if (answer !== null && answer !== undefined) {
        lines.push(`Q: ${q.question}\nA: ${answer}`);
      }
      // Skipped (null) questions are omitted — they do not appear in the message.
    });

    if (lines.length === 0) return; // All skipped — no message (shouldn't happen via normal flow)
    onSubmit(lines.join("\n\n"));
  };

  /** Record answer for current question and advance or submit. */
  const handleAnswer = (text: string) => {
    const next = new Map(answers);
    next.set(currentIndex, text);
    setAnswers(next);

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      formatAndSubmit(next);
    }
  };

  /** Skip current question (null answer) and advance or submit. */
  const handleSkip = () => {
    const next = new Map(answers);
    next.set(currentIndex, null);
    setAnswers(next);

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      formatAndSubmit(next);
    }
  };

  /** Dismiss entire widget — closes silently, no answer recorded, no message sent. */
  const handleDismiss = () => {
    setDismissed(true);
    // No formatAndSubmit — widget disappears with no message.
  };

  // Esc key handler — only skip for types that have a Skip button (single_select, rank_priorities)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && currentQuestion?.type !== "multi_select") {
        handleSkip();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  if (dismissed || !currentQuestion) return null;

  return (
    <div data-testid="ask-user-question-inline" className="space-y-2">
      {/* Pagination header — only for multi-question */}
      {isMultiQuestion && (
        <div data-testid="ask-question-pagination" className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Question {currentIndex + 1} of {questions.length}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentIndex === 0}
              className="px-1 disabled:opacity-30"
              onClick={() => setCurrentIndex(currentIndex - 1)}
              data-testid="ask-question-prev"
              aria-label="Previous question"
            >
              ‹
            </button>
            {/* Dot indicators */}
            <div className="flex items-center gap-0.5" data-testid="ask-question-dots">
              {questions.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    i === currentIndex ? "bg-foreground" : "bg-muted-foreground/30",
                  )}
                />
              ))}
            </div>
            <button
              type="button"
              disabled={currentIndex === questions.length - 1}
              className="px-1 disabled:opacity-30"
              onClick={() => setCurrentIndex(currentIndex + 1)}
              data-testid="ask-question-next"
              aria-label="Next question"
            >
              ›
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="ml-1 text-muted-foreground hover:text-foreground"
              data-testid="ask-question-dismiss"
              aria-label="Dismiss all questions"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <QuestionCard
        key={`q-${currentIndex}`}
        question={currentQuestion}
        onSubmit={handleAnswer}
        onSkip={handleSkip}
        disabled={false}
      />
    </div>
  );
}
```

**Step 4: Update imports**

In the rewritten file:
- Remove `Badge` import (header badge is gone)
- Add `useEffect` to the `useState` import from React
- Keep: `Button`, `Checkbox`, `Input`, `cn`

**Step 5: Update message-bubble.tsx type import**

In `src/components/chat/message-bubble.tsx` line 28: remove `AskUserQuestionOption` from import if present. `AskUserQuestion` type changed shape but message-bubble only passes `output.questions` through — no other changes needed.

**Step 6: Compile check**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: No errors related to ask-user-question files.

**Step 7: Commit**

```bash
git add src/components/chat/ask-user-question-inline.tsx src/components/chat/message-bubble.tsx
git commit -m "feat(ask-user): rewrite component for claude.ai parity — per-type behaviors, silent dismiss"
```

---

### Task 3: Rewrite component tests

**Why:** All test fixtures used the old schema. Per-type behavior is now differentiated (skip/no-skip, something-else/no-something-else). Dismiss is silent. Skipped questions are omitted. Rank format has no prefix.

**Files:**
- Rewrite: `src/components/chat/ask-user-question-inline.test.tsx`

**Step 1: Rewrite the entire test file**

Replace `src/components/chat/ask-user-question-inline.test.tsx`:

```typescript
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

  // ─── Skip ─────────────────────────────────────────────────────

  it("single_select has Skip button", () => {
    render(<AskUserQuestionInline questions={[singleQ]} onSubmit={vi.fn()} />);
    expect(screen.getByTestId("ask-question-skip")).toBeInTheDocument();
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
```

**Step 2: Run tests**

```bash
npx vitest run src/components/chat/ask-user-question-inline.test.tsx --reporter=verbose
```

Expected: All pass. Fix any failures.

**Step 3: Commit**

```bash
git add src/components/chat/ask-user-question-inline.test.tsx
git commit -m "test(ask-user): rewrite tests — per-type skip/something-else, silent dismiss, skipped omitted"
```

---

### Task 4: Update message-bubble and chat-panel tests

**Why:** The message-bubble test fixtures use the old schema shape (`{ label, description }` options, `multiSelect`). The chat-panel test asserts raw answer text. Both need updating.

**Files:**
- Update: `src/components/chat/message-bubble.test.tsx`
- Update: `src/components/chat/chat-panel.test.tsx`

**Step 1: Update all ask_user_question fixtures in message-bubble.test.tsx**

Open `src/components/chat/message-bubble.test.tsx` and find the `ask_user_question` test suite (around line 435). Update every fixture:
- Remove `header`
- Change `options` from `[{ label, description }]` to `["label1", "label2"]`
- Change `multiSelect: false` to `type: "single_select"`
- Change `multiSelect: true` to `type: "multi_select"`

**Step 2: Update chat-panel.test.tsx**

Find the test around line 717. Update the fixture schema. Update the interaction:

1. Click an option (selects radio, doesn't submit)
2. Click "Continue →" (submits)

Update the assertion to match Q&A format. The exact question text depends on the fixture — read first, then match.

**Step 3: Run both test files**

```bash
npx vitest run src/components/chat/message-bubble.test.tsx src/components/chat/chat-panel.test.tsx --reporter=verbose
```

Expected: All pass.

**Step 4: Commit**

```bash
git add src/components/chat/message-bubble.test.tsx src/components/chat/chat-panel.test.tsx
git commit -m "test(ask-user): update message-bubble + chat-panel fixtures for new schema + interaction"
```

---

### Task 5: Update system prompt guidance

**Why:** The system prompt needs to match the new tool capabilities. Critical addition from Anthropic dev: **"Always writes a message before firing the widget — never shows options silently without a preceding conversational line."**

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`

**Step 1: Replace the `<asking-the-user>` section**

In `src/lib/ai/system-prompt.ts`, find the `<asking-the-user>` block (around line 191). Replace it with:

```typescript
<asking-the-user>
Use the ask_user_question tool whenever you have a question for the user. Instead of asking questions in prose, present options as clickable choices.

USE THIS TOOL WHEN:
- User asks a question with 2-10 reasonable answers
- You need clarification to proceed
- Ranking or prioritization would help
- User says "which should I..." or "what do you recommend..."
- User asks for a recommendation across a broad area needing refinement

HOW TO USE:
- Always include a brief conversational message before calling this tool — never show the widget silently
- Generally prefer multi_select — users may have multiple preferences
- Use short, self-explanatory option labels
- Collect all info needed up front: batch related questions into one call (up to 3 questions)
- The user can skip individual questions or type a custom response

SKIP THIS TOOL WHEN:
- Question is open-ended (names, descriptions, free feedback)
- User is clearly venting, not seeking choices
- Context makes the right choice obvious
- User explicitly asked to discuss options in prose
</asking-the-user>
```

**Step 2: Commit**

```bash
git add src/lib/ai/system-prompt.ts
git commit -m "feat(ask-user): update system prompt — always write message before widget"
```

---

### Task 6: Full integration smoke test

**Why:** Verify the full flow end-to-end in the browser.

**Step 1: Run full test suite**

```bash
npx vitest run --reporter=verbose 2>&1 | tail -20
```

Expected: All tests pass. Fix any failures.

**Step 2: Start dev server**

```bash
npm run dev
```

**Step 3: Manual test — single_select**

1. Trigger ask_user_question
2. Verify: radio buttons (○/●), "Something else..." visible, Skip + Continue →
3. Click radio → highlights but does NOT submit
4. Click Continue → → user message shows `Q: ...\nA: ...`

**Step 4: Manual test — multi_select**

1. Trigger multi_select
2. Verify: checkboxes, **NO Skip button**, counter shows "N selected · Cmd+Enter to submit"
3. Select 2+ → counter updates → Continue → enabled
4. Verify Cmd+Enter submits
5. "Something else..." is visible

**Step 5: Manual test — rank_priorities**

1. Trigger rank_priorities
2. Verify: drag handles (⠿), numbered items, Skip button, **NO "Something else..."**
3. Drag to reorder → numbers update
4. Continue → → answer format: `1. X, 2. Y, 3. Z` (no "Ranked:" prefix)

**Step 6: Manual test — multi-question pagination**

1. Trigger 2-3 batched questions
2. Verify: "Question 1 of N" + dot indicators + ‹ › arrows
3. Continue → advances
4. Skip → question omitted from final message
5. Prev → navigate back
6. **Dismiss X → widget disappears, NO message sent**

**Step 7: Commit any polish**

```bash
git add -A
git commit -m "fix(ask-user): smoke test polish"
```

---

## Done Criteria

- [ ] Tool schema: string options, `type` enum (single/multi/rank), max 3 questions
- [ ] Tool description: Anthropic's prescriptive guidance + "always write a message before widget"
- [ ] **single_select:** radio buttons, Skip, "Something else...", Continue →
- [ ] **multi_select:** checkboxes, **NO Skip**, counter ("N selected · Cmd+Enter"), "Something else...", Continue →
- [ ] **rank_priorities:** drag-to-reorder with handles (⠿), numbered, Skip, **NO "Something else..."**, Continue →
- [ ] **Cmd+Enter shortcut** for multi_select
- [ ] **"Something else..."** always-visible for single + multi only
- [ ] **Dismiss X** closes widget silently — no message sent
- [ ] **Skipped questions omitted** from user message (not `A: Skipped`)
- [ ] **Rank format:** `1. X, 2. Y` (no "Ranked:" prefix)
- [ ] **Pagination:** "Question N of M" + dot indicators + ‹ › arrows
- [ ] **Esc key** triggers skip for single_select and rank_priorities only
- [ ] Submit format: `Q: ...\nA: ...` pairs, skipped omitted
- [ ] Disabled state: all questions stacked, no interactive elements
- [ ] System prompt: batching + Anthropic guidance + "always message before widget"
- [ ] All tests passing (tool, component, message-bubble, chat-panel)
