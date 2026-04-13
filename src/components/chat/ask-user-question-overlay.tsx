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
  /** Called when user dismisses all questions (X button or Esc). */
  onDismiss?: () => void;
}

export function AskUserQuestionOverlay({
  questions,
  onSubmit,
  onDismiss,
}: AskUserQuestionOverlayProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<number, string | null>>(new Map());
  const [focusedOption, setFocusedOption] = useState(-1);
  const [otherText, setOtherText] = useState("");
  const [selectedChecks, setSelectedChecks] = useState<string[]>([]);
  const [rankedItems, setRankedItems] = useState<string[]>(questions[0]?.options ?? []);
  const [dismissed, setDismissed] = useState(false);
  const submittedRef = useRef(false);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const otherInputRef = useRef<HTMLInputElement | null>(null);

  const isMultiQuestion = questions.length > 1;
  const currentQuestion = questions[currentIndex];
  const isSingle = currentQuestion?.type === "single_select";
  const isMulti = currentQuestion?.type === "multi_select";
  const isRank = currentQuestion?.type === "rank_priorities";

  // Reset per-question state when advancing to a new question
  const resetQuestionState = useCallback((newIndex: number) => {
    const nextQ = questions[newIndex];
    setFocusedOption(-1);
    setOtherText("");
    setSelectedChecks([]);
    setRankedItems(nextQ?.options ?? []);
  }, [questions]);

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
        const nextIndex = currentIndex + 1;
        setCurrentIndex(nextIndex);
        resetQuestionState(nextIndex);
      } else {
        formatAndSubmit(next);
      }
    },
    [answers, currentIndex, questions.length, formatAndSubmit, resetQuestionState],
  );

  /** Skip current question. */
  const handleSkip = useCallback(() => {
    const next = new Map(answers);
    next.set(currentIndex, null);
    setAnswers(next);

    if (currentIndex < questions.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      resetQuestionState(nextIndex);
    } else {
      formatAndSubmit(next);
    }
  }, [answers, currentIndex, questions.length, formatAndSubmit, resetQuestionState]);

  /** Handle multi_select continue. */
  const handleMultiContinue = useCallback(() => {
    if (selectedChecks.length === 0) return;
    handleAnswer(selectedChecks.join(", "));
  }, [selectedChecks, handleAnswer]);

  /** Handle rank_priorities continue. */
  const handleRankContinue = useCallback(() => {
    const ranked = rankedItems.map((o, i) => `${i + 1}. ${o}`).join(", ");
    handleAnswer(ranked);
  }, [rankedItems, handleAnswer]);

  /** Dismiss entire widget. */
  const handleDismiss = useCallback(() => {
    setDismissed(true);
    onDismiss?.();
  }, [onDismiss]);

  // Focus the active option when focusedOption changes (single_select only, skip -1)
  useEffect(() => {
    if (isSingle && focusedOption >= 0) {
      optionRefs.current[focusedOption]?.focus();
    }
  }, [focusedOption, isSingle]);

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
          if (!isSingle) break;
          e.preventDefault();
          setFocusedOption((prev) => prev < 0 ? 0 : (prev + 1) % optionCount);
          break;
        }
        case "ArrowUp": {
          if (!isSingle) break;
          e.preventDefault();
          setFocusedOption((prev) => prev < 0 ? optionCount - 1 : (prev - 1 + optionCount) % optionCount);
          break;
        }
        case "Enter": {
          if (isSingle && currentQuestion && focusedOption >= 0) {
            e.preventDefault();
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
          // Number keys 1-9 for quick select (single_select only)
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

  // ─── Drag handlers for rank_priorities ───────────────────────────
  let dragIndex: number | null = null;
  const handleDragStart = (index: number) => { dragIndex = index; };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const reordered = [...rankedItems];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(index, 0, moved);
    setRankedItems(reordered);
    dragIndex = index;
  };

  return (
    <div
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
                onClick={() => {
                  const prevIndex = currentIndex - 1;
                  setCurrentIndex(prevIndex);
                  resetQuestionState(prevIndex);
                }}
                aria-label="Previous question"
              >
                &lsaquo;
              </button>
              <span>{currentIndex + 1} of {questions.length}</span>
              <button
                type="button"
                disabled={currentIndex === questions.length - 1}
                className="px-0.5 disabled:opacity-30"
                onClick={() => {
                  const nextIndex = currentIndex + 1;
                  setCurrentIndex(nextIndex);
                  resetQuestionState(nextIndex);
                }}
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
        {/* ─── single_select ─────────────────────────────────────── */}
        {isSingle && currentQuestion.options.map((option, index) => (
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
            onClick={() => handleAnswer(option)}
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

        {/* ─── multi_select ──────────────────────────────────────── */}
        {isMulti && currentQuestion.options.map((option) => {
          const isChecked = selectedChecks.includes(option);
          return (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={isChecked}
              data-testid="ask-question-option"
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                isChecked
                  ? "border-primary/40 bg-primary/5"
                  : "border-border/50 bg-background hover:border-border hover:bg-secondary/30",
              )}
              onClick={() => {
                setSelectedChecks((prev) =>
                  prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option],
                );
              }}
            >
              <span className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded border-2",
                isChecked ? "border-primary bg-primary/10" : "border-muted-foreground/40",
              )}>
                {isChecked && <span className="h-2 w-2 rounded-sm bg-primary" />}
              </span>
              <span className="flex-1">{option}</span>
            </button>
          );
        })}

        {/* ─── rank_priorities ───────────────────────────────────── */}
        {isRank && rankedItems.map((option, index) => (
          <div
            key={option}
            data-testid="ask-question-option"
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={() => { dragIndex = null; }}
            className="flex cursor-grab items-center gap-3 rounded-lg border border-border/50 bg-background px-3 py-2.5 text-sm active:cursor-grabbing hover:border-border hover:bg-secondary/30"
          >
            <span className="text-muted-foreground/50 select-none" aria-hidden>⠿</span>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
              {index + 1}
            </span>
            <span className="flex-1">{option}</span>
          </div>
        ))}
      </div>

      {/* Counter for multi_select */}
      {isMulti && selectedChecks.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground" data-testid="ask-question-counter">
          {selectedChecks.length} selected
        </p>
      )}

      {/* Something else + Skip row (single_select and rank has skip, rank has no "something else") */}
      <div className="mt-2 flex items-center gap-2">
        {isSingle && (
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
        )}

        {/* multi_select: Continue button (no Skip) */}
        {isMulti && (
          <button
            type="button"
            data-testid="ask-question-continue"
            disabled={selectedChecks.length === 0}
            className="ml-auto rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
            onClick={handleMultiContinue}
          >
            Continue
          </button>
        )}

        {/* rank_priorities: Skip + Continue */}
        {isRank && (
          <>
            <button
              type="button"
              onClick={handleSkip}
              className="text-sm text-muted-foreground hover:text-foreground"
              data-testid="ask-question-skip"
            >
              Skip
            </button>
            <button
              type="button"
              data-testid="ask-question-continue"
              className="ml-auto rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
              onClick={handleRankContinue}
            >
              Continue
            </button>
          </>
        )}

        {/* single_select: Skip button */}
        {isSingle && (
          <button
            type="button"
            onClick={handleSkip}
            className="text-sm text-muted-foreground hover:text-foreground"
            data-testid="ask-question-skip"
          >
            Skip
          </button>
        )}
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
