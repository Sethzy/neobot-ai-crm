/**
 * Inline field editor for CRM drawer surfaces.
 * @module components/crm/inline-edit-field
 */
"use client";

import { Check, CalendarIcon, Loader2, Pencil } from "@/components/icons/lucide-compat";
import { format } from "date-fns";
import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface SelectOption {
  /** Persisted option value. */
  value: string;
  /** Human-readable option label. */
  label: string;
}

type InlineEditType = "text" | "textarea" | "select" | "date" | "number";

interface InlineEditFieldProps {
  /** Field label rendered on the left side. */
  label: string;
  /** Current field value from query data. */
  value: string | null;
  /** Optional display-only value when the edit draft should differ from the rendered label. */
  displayValue?: string | null;
  /** Input type used when switching to edit mode. */
  type?: InlineEditType;
  /** Optional HTML input type when `type="text"` or `type="number"`. */
  inputType?: React.HTMLInputTypeAttribute;
  /** Select options for `type="select"`. */
  options?: SelectOption[];
  /** Hides the label for heading-style edit surfaces. */
  hideLabel?: boolean;
  /** Optional className for the clickable field container. */
  containerClassName?: string;
  /** Optional className for the label text. */
  labelClassName?: string;
  /** Optional className for the rendered display value. */
  displayClassName?: string;
  /** Optional className for the editor wrapper width/layout. */
  editorClassName?: string;
  /** Called after the field is committed. */
  onSave: (value: string) => Promise<void> | void;
}

const savedIndicatorDurationMs = 1500;

function toLocalIsoMidnight(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const timezoneMinutes = -date.getTimezoneOffset();
  const sign = timezoneMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(timezoneMinutes);
  const offsetHours = String(Math.floor(absoluteMinutes / 60)).padStart(2, "0");
  const offsetMinutes = String(absoluteMinutes % 60).padStart(2, "0");

  return `${year}-${month}-${day}T00:00:00${sign}${offsetHours}:${offsetMinutes}`;
}

function parseDateValue(value: string): Date | null {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
}

export function InlineEditField({
  label,
  value,
  displayValue,
  type = "text",
  inputType,
  options = [],
  hideLabel = false,
  containerClassName,
  labelClassName,
  displayClassName,
  editorClassName,
  onSave,
}: InlineEditFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const savedTimerRef = useRef<number | null>(null);

  const currentValue = value ?? "";

  useEffect(() => {
    if (!isEditing) {
      setDraft(currentValue);
    }
  }, [currentValue, isEditing]);

  useEffect(() => {
    if (isEditing && (type === "text" || type === "textarea" || type === "number")) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing, type]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== null) {
        window.clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  const setSavedIndicator = useCallback(() => {
    if (savedTimerRef.current !== null) {
      window.clearTimeout(savedTimerRef.current);
    }

    setIsSaved(true);
    savedTimerRef.current = window.setTimeout(() => {
      setIsSaved(false);
      savedTimerRef.current = null;
    }, savedIndicatorDurationMs);
  }, []);

  const handleStartEditing = useCallback(() => {
    if (isSaving || isEditing) {
      return;
    }

    setDraft(currentValue);
    setIsEditing(true);
    if (type === "date") {
      setIsDatePickerOpen(true);
    }
  }, [currentValue, isEditing, isSaving, type]);

  const handleCancel = useCallback(() => {
    setDraft(currentValue);
    setIsEditing(false);
    setIsDatePickerOpen(false);
  }, [currentValue]);

  const handleCommit = useCallback(
    async (nextValue: string) => {
      if (isSaving) {
        return;
      }

      const normalizedCurrent = currentValue.trim();
      const normalizedNext = nextValue.trim();

      if (normalizedCurrent === normalizedNext) {
        setIsEditing(false);
        setIsDatePickerOpen(false);
        return;
      }

      setIsSaving(true);
      try {
        await onSave(normalizedNext);
        setIsEditing(false);
        setIsDatePickerOpen(false);
        setSavedIndicator();
      } catch {
        // Keep edit mode open so the caller can retry after transient failures.
      } finally {
        setIsSaving(false);
      }
    },
    [currentValue, isSaving, onSave, setSavedIndicator],
  );

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCancel();
        return;
      }

      if (event.key === "Enter" && type !== "textarea") {
        event.preventDefault();
        void handleCommit(draft);
      }
    },
    [draft, handleCancel, handleCommit, type],
  );

  const handleContainerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (isEditing) {
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleStartEditing();
      }
    },
    [handleStartEditing, isEditing],
  );

  const dateFromDraft = useMemo(() => (draft ? parseDateValue(draft) : null), [draft]);
  const dateFromValue = useMemo(() => (value ? parseDateValue(value) : null), [value]);

  const resolvedDisplayValue = useMemo(() => {
    if (displayValue !== undefined) {
      const normalizedDisplayValue = displayValue?.trim();
      return normalizedDisplayValue && normalizedDisplayValue.length > 0 ? normalizedDisplayValue : "—";
    }

    if (type === "select") {
      if (!value) {
        return "—";
      }

      return options.find((option) => option.value === value)?.label ?? value;
    }

    if (type === "date") {
      if (!dateFromValue) {
        return "—";
      }

      return format(dateFromValue, "d MMM yyyy");
    }

    const normalizedValue = value?.trim();
    return normalizedValue && normalizedValue.length > 0 ? normalizedValue : "—";
  }, [dateFromValue, displayValue, options, type, value]);

  const isTextareaField = type === "textarea";

  const renderEditor = (inputElementRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>) => {
    if (type === "select") {
      return (
        <Select
          value={draft}
          onValueChange={(nextValue) => {
            setDraft(nextValue);
            void handleCommit(nextValue);
          }}
          disabled={isSaving}
        >
            <SelectTrigger className="h-8 min-w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (type === "textarea") {
      return (
          <Textarea
            ref={inputElementRef as RefObject<HTMLTextAreaElement>}
            rows={3}
            className={cn("min-h-20 w-full", editorClassName)}
            value={draft}
            disabled={isSaving}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            void handleCommit(draft);
          }}
          onKeyDown={handleInputKeyDown}
        />
      );
    }

    if (type === "date") {
      return (
        <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("h-8 w-[220px] justify-start text-left text-sm font-normal", editorClassName)}
              disabled={isSaving}
            >
              <CalendarIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
              {dateFromDraft ? format(dateFromDraft, "d MMM yyyy") : "Select date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={dateFromDraft ?? undefined}
              onSelect={(nextDate) => {
                if (!nextDate) {
                  return;
                }

                const serializedDate = toLocalIsoMidnight(nextDate);
                setDraft(serializedDate);
                void handleCommit(serializedDate);
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      );
    }

    return (
        <Input
          ref={inputElementRef as RefObject<HTMLInputElement>}
          type={inputType ?? (type === "number" ? "number" : "text")}
          inputMode={type === "number" ? "decimal" : undefined}
          value={draft}
          disabled={isSaving}
          className={cn("h-8 w-[220px]", editorClassName)}
          onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          void handleCommit(draft);
        }}
        onKeyDown={handleInputKeyDown}
      />
    );
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "group flex items-start justify-between gap-3 rounded-md px-1 py-1.5 transition-colors hover:bg-muted/30",
        hideLabel && "justify-start",
        isTextareaField && !hideLabel && "items-start",
        containerClassName,
      )}
      onClick={handleStartEditing}
      onKeyDown={handleContainerKeyDown}
    >
      {hideLabel ? null : (
        <span className={cn("text-sm text-muted-foreground", labelClassName)}>{label}</span>
      )}

      <div
        className={cn(
          "flex items-center gap-2",
          isEditing
            ? isTextareaField
              ? "w-full max-w-full"
              : "max-w-[220px]"
            : hideLabel
              ? "min-w-0"
              : isTextareaField
                ? "min-w-0 flex-1 items-start max-w-full"
                : "min-w-0 max-w-[220px]",
        )}
      >
        {isEditing ? (
          renderEditor(inputRef)
        ) : (
          <>
            <span
              className={cn(
                "text-sm text-foreground/80",
                isTextareaField
                  ? "line-clamp-4 w-full whitespace-pre-wrap break-words text-left"
                  : hideLabel
                    ? "w-full whitespace-normal break-words"
                    : "truncate",
                hideLabel ? "text-left" : isTextareaField ? "text-left" : "text-right",
                displayClassName,
              )}
            >
              {resolvedDisplayValue}
            </span>
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground/60" />
            ) : isSaved ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
            ) : (
              <Pencil className="h-3 w-3 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
            )}
          </>
        )}
      </div>
    </div>
  );
}
