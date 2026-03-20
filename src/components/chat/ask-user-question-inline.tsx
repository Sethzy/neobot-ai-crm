/**
 * Inline interactive widget for the ask_user_question tool — claude.ai parity.
 * Renders paginated questions with per-type controls:
 *   single_select:  radio buttons, Skip, "Something else...", Continue →
 *   multi_select:   checkboxes, counter, Cmd+Enter, "Something else...", Continue → (NO Skip)
 *   rank_priorities: drag handles, numbered, Skip, Continue → (NO "Something else...")
 * @module components/chat/ask-user-question-inline
 */
"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface AskUserQuestion {
  question: string;
  options: string[];
  type: "single_select" | "multi_select" | "rank_priorities";
}

interface AskUserQuestionInlineProps {
  questions: AskUserQuestion[];
  onSubmit: (text: string) => void;
  /** When true, renders as static text with no interaction (for non-latest messages). */
  disabled?: boolean;
}

/** Renders a single question card with per-type controls. */
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

    if (lines.length === 0) return; // All skipped — no message
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
