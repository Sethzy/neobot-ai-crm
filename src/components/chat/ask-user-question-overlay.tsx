/**
 * Claude.ai-style overlay widget for the ask_user_question tool.
 * Renders as a flex sibling between MessageList and ChatComposer.
 * Supports single_select, multi_select, rank_priorities.
 * @module components/chat/ask-user-question-overlay
 */
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { Pencil } from "lucide-react";

import { cn } from "@/lib/utils";

export interface AskUserQuestion {
  question: string;
  options: string[];
  type: "single_select" | "multi_select" | "rank_priorities";
}

interface AskUserQuestionOverlayProps {
  questions: AskUserQuestion[];
  onSubmit: (text: string) => void;
  /** Called when user dismisses the full batch from the header close action. */
  onDismiss?: (text: string) => void;
  className?: string;
}

interface QuestionDraft {
  otherText: string;
  rankedItems: string[];
  selectedChecks: string[];
  selectedOption: string | null;
}

function createQuestionDraft(question?: AskUserQuestion): QuestionDraft {
  return {
    otherText: "",
    rankedItems: question?.options ?? [],
    selectedChecks: [],
    selectedOption: null,
  };
}

function formatQuestionResponses(
  questions: AskUserQuestion[],
  answers: Map<number, string>,
): string {
  const lines: string[] = [];

  questions.forEach((question, index) => {
    const answer = answers.get(index);
    if (typeof answer !== "string" || answer.trim().length === 0) {
      return;
    }

    lines.push(`Q: ${question.question}\nA: ${answer}`);
  });

  return lines.join("\n\n");
}

export function AskUserQuestionOverlay({
  questions,
  onSubmit,
  onDismiss,
  className,
}: AskUserQuestionOverlayProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<number, string>>(new Map());
  const [drafts, setDrafts] = useState<Map<number, QuestionDraft>>(new Map());
  const [focusedOption, setFocusedOption] = useState(
    questions[0]?.type === "single_select" && questions[0].options.length > 0 ? 0 : -1,
  );
  const submittedRef = useRef(false);
  const dragIndexRef = useRef<number | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const otherInputRef = useRef<HTMLInputElement | null>(null);

  const isMultiQuestion = questions.length > 1;
  const currentQuestion = questions[currentIndex];
  const isSingle = currentQuestion?.type === "single_select";
  const isMulti = currentQuestion?.type === "multi_select";
  const isRank = currentQuestion?.type === "rank_priorities";
  const currentDraft = drafts.get(currentIndex) ?? createQuestionDraft(currentQuestion);

  const updateDraft = useCallback(
    (index: number, updater: (draft: QuestionDraft) => QuestionDraft) => {
      setDrafts((previousDrafts) => {
        const nextDrafts = new Map(previousDrafts);
        const draft = previousDrafts.get(index) ?? createQuestionDraft(questions[index]);
        nextDrafts.set(index, updater(draft));
        return nextDrafts;
      });
    },
    [questions],
  );

  const resolveFocusedOption = useCallback(
    (index: number) => {
      const question = questions[index];
      if (question?.type !== "single_select" || question.options.length === 0) {
        return -1;
      }

      const selectedOption =
        drafts.get(index)?.selectedOption ??
        (typeof answers.get(index) === "string" ? answers.get(index) : null);

      if (typeof selectedOption === "string") {
        const selectedIndex = question.options.indexOf(selectedOption);
        if (selectedIndex >= 0) {
          return selectedIndex;
        }
      }

      return 0;
    },
    [answers, drafts, questions],
  );

  const goToQuestion = useCallback(
    (nextIndex: number) => {
      optionRefs.current = [];
      setCurrentIndex(nextIndex);
      setFocusedOption(resolveFocusedOption(nextIndex));
    },
    [resolveFocusedOption],
  );

  const emitSubmit = useCallback(
    (text: string) => {
      if (submittedRef.current || text.trim().length === 0) {
        return;
      }

      submittedRef.current = true;
      onSubmit(text);
    },
    [onSubmit],
  );

  const emitDismiss = useCallback(
    (text: string) => {
      if (submittedRef.current || text.trim().length === 0) {
        return;
      }

      submittedRef.current = true;
      onDismiss?.(text);
      if (!onDismiss) {
        onSubmit(text);
      }
    },
    [onDismiss, onSubmit],
  );

  /** Format collected Q&A pairs into the user message text. */
  const formatAndSubmit = useCallback(
    (finalAnswers: Map<number, string>) => {
      emitSubmit(formatQuestionResponses(questions, finalAnswers));
    },
    [emitSubmit, questions],
  );

  /** Record answer and advance or submit. */
  const handleAnswer = useCallback(
    (text: string) => {
      const next = new Map(answers);
      next.set(currentIndex, text);
      setAnswers(next);

      if (currentIndex < questions.length - 1) {
        goToQuestion(currentIndex + 1);
      } else {
        formatAndSubmit(next);
      }
    },
    [answers, currentIndex, formatAndSubmit, goToQuestion, questions.length],
  );

  /** Skip current question. */
  const handleSkip = useCallback(() => {
    const next = new Map(answers);
    next.set(currentIndex, "Skipped");
    setAnswers(next);

    if (currentIndex < questions.length - 1) {
      goToQuestion(currentIndex + 1);
    } else {
      formatAndSubmit(next);
    }
  }, [answers, currentIndex, formatAndSubmit, goToQuestion, questions.length]);

  /** Handle multi_select continue. */
  const handleMultiContinue = useCallback(() => {
    if (currentDraft.selectedChecks.length === 0) {
      return;
    }

    handleAnswer(currentDraft.selectedChecks.join(", "));
  }, [currentDraft.selectedChecks, handleAnswer]);

  /** Handle rank_priorities continue. */
  const handleRankContinue = useCallback(() => {
    const ranked = currentDraft.rankedItems.map((option, index) => `${index + 1}. ${option}`).join(", ");
    handleAnswer(ranked);
  }, [currentDraft.rankedItems, handleAnswer]);

  /** Dismiss entire widget. */
  const handleDismiss = useCallback(() => {
    const dismissedAnswers = new Map(answers);

    questions.forEach((_question, index) => {
      if (!dismissedAnswers.has(index)) {
        dismissedAnswers.set(index, "Dismissed");
      }
    });

    emitDismiss(formatQuestionResponses(questions, dismissedAnswers));
  }, [answers, emitDismiss, questions]);

  useEffect(() => {
    if (isSingle && focusedOption >= 0) {
      optionRefs.current[focusedOption]?.focus();
    }
  }, [currentIndex, focusedOption, isSingle]);

  useEffect(() => {
    if (isSingle) {
      return;
    }

    overlayRef.current?.focus();
  }, [currentIndex, isSingle]);

  const handleOverlayKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.target === otherInputRef.current) {
        if (event.key === "Escape") {
          event.preventDefault();
          otherInputRef.current?.blur();
          if (isSingle && currentQuestion) {
            const nextFocusedOption = resolveFocusedOption(currentIndex);
            setFocusedOption(nextFocusedOption);
            optionRefs.current[nextFocusedOption]?.focus();
          }
        }
        return;
      }

      const optionCount = currentQuestion?.options.length ?? 0;

      switch (event.key) {
        case "ArrowDown": {
          if (!isSingle || optionCount === 0) {
            break;
          }

          event.preventDefault();
          setFocusedOption((previousFocusedOption) =>
            previousFocusedOption < 0
              ? 0
              : (previousFocusedOption + 1) % optionCount,
          );
          break;
        }
        case "ArrowUp": {
          if (!isSingle || optionCount === 0) {
            break;
          }

          event.preventDefault();
          setFocusedOption((previousFocusedOption) =>
            previousFocusedOption < 0
              ? optionCount - 1
              : (previousFocusedOption - 1 + optionCount) % optionCount,
          );
          break;
        }
        case "Enter": {
          if (isSingle && currentQuestion && focusedOption >= 0) {
            event.preventDefault();
            handleAnswer(currentQuestion.options[focusedOption]);
          }
          break;
        }
        case "Escape": {
          if (isSingle || isRank) {
            event.preventDefault();
            handleSkip();
          }
          break;
        }
        default: {
          const num = Number.parseInt(event.key, 10);
          if (num >= 1 && num <= optionCount && isSingle && currentQuestion) {
            event.preventDefault();
            handleAnswer(currentQuestion.options[num - 1]);
          }
        }
      }
    },
    [
      currentIndex,
      currentQuestion,
      focusedOption,
      handleAnswer,
      handleSkip,
      isRank,
      isSingle,
      resolveFocusedOption,
    ],
  );

  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
  }, []);

  const handleDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>, index: number) => {
      event.preventDefault();

      if (dragIndexRef.current === null || dragIndexRef.current === index) {
        return;
      }

      const sourceIndex = dragIndexRef.current;
      updateDraft(currentIndex, (draft) => {
        const reordered = [...draft.rankedItems];
        const [movedItem] = reordered.splice(sourceIndex, 1);
        reordered.splice(index, 0, movedItem);
        return {
          ...draft,
          rankedItems: reordered,
        };
      });
      dragIndexRef.current = index;
    },
    [currentIndex, updateDraft],
  );

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
  }, []);

  if (!currentQuestion) {
    return null;
  }

  const keyboardHint = isSingle
    ? "↑↓ to navigate · Enter to select · Esc to skip"
    : isRank
      ? "Drag to reorder · Esc to skip"
      : "Select all that apply · Continue to submit";

  return (
    <div
      data-testid="ask-question-overlay"
      ref={overlayRef}
      role="group"
      tabIndex={-1}
      onKeyDown={handleOverlayKeyDown}
      className={cn(
        "mx-auto w-full max-w-[44rem] rounded-2xl border border-border/50 bg-card px-5 pb-4 pt-5 shadow-[0_8px_32px_rgba(15,23,42,0.10)]",
        className,
      )}
    >
      {/* Header: question text + pagination + dismiss */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <p className="text-body font-semibold text-foreground">
          {currentQuestion.question}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {isMultiQuestion && (
            <div
              data-testid="ask-question-pagination"
              className="flex items-center gap-0.5 text-xs text-muted-foreground"
            >
              <button
                type="button"
                disabled={currentIndex === 0}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-base transition-colors hover:bg-muted disabled:opacity-30"
                onClick={() => goToQuestion(currentIndex - 1)}
                aria-label="Previous question"
              >
                &lsaquo;
              </button>
              <span className="min-w-12 text-center text-caption text-muted-foreground">
                {currentIndex + 1} of {questions.length}
              </span>
              <button
                type="button"
                disabled={currentIndex === questions.length - 1}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-base transition-colors hover:bg-muted disabled:opacity-30"
                onClick={() => goToQuestion(currentIndex + 1)}
                aria-label="Next question"
              >
                &rsaquo;
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            data-testid="ask-question-dismiss"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Options list — clean divider-separated rows, no per-item border boxes */}
      <div role="listbox" aria-label={currentQuestion.question} className="flex flex-col">
        {/* ─── single_select ─────────────────────────────────────── */}
        {isSingle && currentQuestion.options.map((option, index) => (
          <div key={option}>
            {index > 0 && <div className="h-px bg-border/30" />}
            <button
              ref={(el) => { optionRefs.current[index] = el; }}
              type="button"
              role="option"
              aria-selected={focusedOption === index}
              tabIndex={focusedOption === index ? 0 : -1}
              data-testid="ask-question-option"
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2 py-3.5 text-left text-sm transition-colors focus:outline-none",
                focusedOption === index
                  ? "bg-muted/35"
                  : "hover:bg-muted/20",
              )}
              onClick={() => {
                updateDraft(currentIndex, (draft) => ({
                  ...draft,
                  selectedOption: option,
                }));
                handleAnswer(option);
              }}
              onMouseEnter={() => setFocusedOption(index)}
              >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-caption font-medium text-muted-foreground">
                {index + 1}
              </span>
              <span className="flex-1 text-meta text-foreground">{option}</span>
              {focusedOption === index && (
                <span className="text-meta text-muted-foreground">→</span>
              )}
            </button>
          </div>
        ))}

        {/* ─── multi_select ──────────────────────────────────────── */}
        {isMulti && currentQuestion.options.map((option, index) => {
          const isChecked = currentDraft.selectedChecks.includes(option);
          return (
            <div key={option}>
              {index > 0 && <div className="h-px bg-border/30" />}
              <button
                type="button"
                role="option"
                aria-selected={isChecked}
                data-testid="ask-question-option"
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-2 py-3.5 text-left text-sm transition-colors focus:outline-none",
                  isChecked ? "bg-muted/35" : "hover:bg-muted/20",
                )}
                onClick={() => {
                  updateDraft(currentIndex, (draft) => ({
                    ...draft,
                    selectedChecks: draft.selectedChecks.includes(option)
                      ? draft.selectedChecks.filter((existingOption) => existingOption !== option)
                      : [...draft.selectedChecks, option],
                  }));
                }}
              >
                <span className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors",
                  isChecked ? "border-primary bg-primary/10" : "border-muted-foreground/35",
                )}>
                  {isChecked && <span className="h-2 w-2 rounded-sm bg-primary" />}
                </span>
                <span className="flex-1 text-meta text-foreground">{option}</span>
              </button>
            </div>
          );
        })}

        {/* ─── rank_priorities ───────────────────────────────────── */}
        {isRank && currentDraft.rankedItems.map((option, index) => (
          <div key={option}>
            {index > 0 && <div className="h-px bg-border/30" />}
            <div
              data-testid="ask-question-option"
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(event) => handleDragOver(event, index)}
              onDragEnd={handleDragEnd}
              className="flex cursor-grab items-center gap-3 rounded-lg px-2 py-3.5 text-sm transition-colors active:cursor-grabbing hover:bg-muted/20"
            >
              <span className="select-none text-muted-foreground/40" aria-hidden>⠿</span>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-caption font-medium text-muted-foreground">
                {index + 1}
              </span>
              <span className="flex-1 text-meta text-foreground">{option}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Counter for multi_select */}
      {isMulti && currentDraft.selectedChecks.length > 0 && (
        <p className="mt-1 px-2 text-caption text-muted-foreground" data-testid="ask-question-counter">
          {currentDraft.selectedChecks.length} selected
        </p>
      )}

      {/* Bottom row — Something else input + action buttons */}
      <div className="mt-1 flex items-center gap-3 border-t border-border/30 pl-2 pt-2.5">
        {/* single_select: pencil-icon + freetext input */}
        {isSingle && (
          <>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground/60">
              <Pencil size={12} />
            </span>
            <input
              ref={otherInputRef}
              type="text"
              value={currentDraft.otherText}
              onChange={(event) =>
                updateDraft(currentIndex, (draft) => ({
                  ...draft,
                  otherText: event.target.value,
                }))}
              onFocus={() => setFocusedOption(-1)}
            placeholder="Something else"
            data-testid="ask-question-other-input"
              className="flex-1 bg-transparent text-meta text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              onKeyDown={(event) => {
                const submittedText = event.currentTarget.value.trim();
                if (event.key === "Enter" && submittedText.length > 0) {
                  event.preventDefault();
                  updateDraft(currentIndex, (draft) => ({
                    ...draft,
                    selectedOption: null,
                  }));
                  handleAnswer(submittedText);
                }
              }}
            />
          </>
        )}

        {/* multi_select: Continue button + no Skip */}
        {isMulti && (
          <button
            type="button"
            data-testid="ask-question-continue"
            disabled={currentDraft.selectedChecks.length === 0}
            className="ml-auto rounded-lg bg-foreground px-4 py-2 text-meta font-medium text-background transition-opacity disabled:opacity-35"
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
              className="rounded-lg border border-border/60 px-3.5 py-1.5 text-meta text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              data-testid="ask-question-skip"
            >
              Skip
            </button>
            <button
              type="button"
              data-testid="ask-question-continue"
              className="ml-auto rounded-lg bg-foreground px-4 py-2 text-meta font-medium text-background"
              onClick={handleRankContinue}
            >
              Continue
            </button>
          </>
        )}

        {/* single_select: Skip button — bordered pill, clearly clickable */}
        {isSingle && (
          <button
            type="button"
            onClick={handleSkip}
            className="ml-auto rounded-lg border border-border/60 px-3.5 py-1.5 text-meta text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            data-testid="ask-question-skip"
          >
            Skip
          </button>
        )}
      </div>

      {/* Keyboard hints */}
      <div
        data-testid="ask-question-hints"
        className="mt-2.5 flex items-center justify-center gap-3 text-caption text-muted-foreground/50"
      >
        <span>{keyboardHint}</span>
      </div>
    </div>
  );
}
