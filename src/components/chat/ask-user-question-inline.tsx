/**
 * Inline interactive options for the ask_user_question tool.
 * Renders structured questions with clickable option buttons + "Other" free-text input.
 * Single-select: clicking an option immediately submits. Multi-select: checkboxes + "Done" button.
 * @module components/chat/ask-user-question-inline
 */
"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface AskUserQuestionOption {
  label: string;
  description: string;
}

export interface AskUserQuestion {
  question: string;
  header: string;
  options: AskUserQuestionOption[];
  multiSelect: boolean;
}

interface AskUserQuestionInlineProps {
  questions: AskUserQuestion[];
  onSubmit: (text: string) => void;
  /** When true, renders as static text with no interaction (for non-latest messages). */
  disabled?: boolean;
}

/** Renders a single question card with options. */
function QuestionCard({
  question,
  onSubmit,
  disabled,
}: {
  question: AskUserQuestion;
  onSubmit: (text: string) => void;
  disabled: boolean;
}) {
  const [showOther, setShowOther] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleSingleSelect = (label: string) => {
    if (disabled) return;
    onSubmit(label);
  };

  const handleMultiToggle = (label: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  const handleMultiDone = () => {
    if (selected.size === 0) return;
    // Preserve display order (not click order) by filtering from the original options
    const ordered = question.options
      .filter((o) => selected.has(o.label))
      .map((o) => o.label);
    onSubmit(ordered.join(", "));
  };

  const handleOtherSubmit = () => {
    const trimmed = otherText.trim();
    if (trimmed.length === 0) return;
    onSubmit(trimmed);
  };

  return (
    <div
      data-testid="ask-question-card"
      className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2.5"
    >
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
          {question.header}
        </Badge>
      </div>

      <p className="text-sm text-foreground">{question.question}</p>

      <div className="flex flex-col gap-1.5">
        {question.options.map((option) => {
          if (question.multiSelect) {
            const isChecked = selected.has(option.label);
            return (
              <label
                key={option.label}
                data-testid="ask-question-option"
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  disabled
                    ? "cursor-default border-border/30 bg-muted/20 text-muted-foreground"
                    : isChecked
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/50 bg-background hover:border-border hover:bg-secondary/30",
                )}
                onClick={(e) => {
                  e.preventDefault();
                  if (!disabled) handleMultiToggle(option.label);
                }}
              >
                <Checkbox
                  checked={isChecked}
                  disabled={disabled}
                  className="mt-0.5 pointer-events-none"
                  tabIndex={-1}
                />
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{option.label}</span>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {option.description}
                  </p>
                </div>
              </label>
            );
          }

          return (
            <button
              key={option.label}
              type="button"
              disabled={disabled}
              data-testid="ask-question-option"
              className={cn(
                "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                disabled
                  ? "cursor-default border-border/30 bg-muted/20 text-muted-foreground"
                  : "border-border/50 bg-background hover:border-border hover:bg-secondary/30",
              )}
              onClick={() => handleSingleSelect(option.label)}
            >
              <span className="font-medium">{option.label}</span>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {option.description}
              </p>
            </button>
          );
        })}

        {/* "Other" option */}
        {!disabled && !showOther && (
          <button
            type="button"
            data-testid="ask-question-other-trigger"
            aria-label="Provide a custom response"
            className="rounded-md border border-dashed border-border/50 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
            onClick={() => setShowOther(true)}
          >
            Other...
          </button>
        )}

        {!disabled && showOther && (
          <div data-testid="ask-question-other-input" className="flex gap-2">
            <Input
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              placeholder="Type your response..."
              className="text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleOtherSubmit();
                }
              }}
              autoFocus
            />
            <Button
              size="sm"
              onClick={handleOtherSubmit}
              disabled={otherText.trim().length === 0}
            >
              Send
            </Button>
          </div>
        )}
      </div>

      {/* Multi-select "Done" button */}
      {question.multiSelect && !disabled && (
        <div className="flex justify-end">
          <Button
            size="sm"
            data-testid="ask-question-done"
            disabled={selected.size === 0}
            onClick={handleMultiDone}
          >
            Done
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
  return (
    <div data-testid="ask-user-question-inline" className="space-y-2">
      {questions.map((q, i) => (
        <QuestionCard
          key={`${q.header}-${i}`}
          question={q}
          onSubmit={onSubmit}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
