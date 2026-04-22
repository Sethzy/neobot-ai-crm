/**
 * Inline field editor for CRM drawer surfaces.
 * Modeled after Twenty CRM's RecordInlineCell pattern:
 * - Fixed row height (no layout shift on edit)
 * - Label+icon column anchored with self-start + fixed h-7
 * - Text/number edit: inline chip border with py-0, same line-height
 * - Select edit: Popover portal dropdown (no inline trigger)
 * - Values left-aligned, empty fields show label as placeholder
 * @module components/crm/inline-edit-field
 */
"use client";

import { Check, CalendarIcon, ChevronDown, Loader2 } from "@/components/icons/lucide-compat";
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

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface SelectOption {
  /** Persisted option value. */
  value: string;
  /** Human-readable option label. */
  label: string;
}

type InlineEditType = "text" | "textarea" | "select" | "date" | "number";

interface InlineEditFieldProps {
  /** Optional leading icon rendered before the label (e.g. a lucide icon at h-4 w-4). */
  icon?: React.ReactNode;
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
  icon,
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

  /** Resolved text to show in display mode. */
  const resolvedDisplayValue = useMemo(() => {
    if (displayValue !== undefined) {
      const normalized = displayValue?.trim();
      return normalized && normalized.length > 0 ? normalized : null;
    }

    if (type === "select") {
      if (!value) return null;
      return options.find((option) => option.value === value)?.label ?? value;
    }

    if (type === "date") {
      if (!dateFromValue) return null;
      return format(dateFromValue, "d MMM yyyy");
    }

    const normalized = value?.trim();
    return normalized && normalized.length > 0 ? normalized : null;
  }, [dateFromValue, displayValue, options, type, value]);

  /** Whether the field has a real value (not empty/null). */
  const hasValue = resolvedDisplayValue !== null;

  const isTextareaField = type === "textarea";
  const isSelectField = type === "select";
  const isDateField = type === "date";

  // ---------------------------------------------------------------------------
  // Display value element (shared between display and select-edit modes)
  // ---------------------------------------------------------------------------

  const displayElement = (
    <span
      className={cn(
        "min-w-0 flex-1 text-sm leading-[20px]",
        hasValue ? "text-foreground/80" : "text-muted-foreground/40",
        isTextareaField
          ? "line-clamp-4 whitespace-pre-wrap break-words"
          : hideLabel
            ? "whitespace-normal break-words"
            : "truncate",
        displayClassName,
      )}
    >
      {resolvedDisplayValue ?? label}
    </span>
  );

  // ---------------------------------------------------------------------------
  // Status indicator (saving / saved)
  // ---------------------------------------------------------------------------

  const statusIndicator = isSaving ? (
    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground/50" />
  ) : isSaved ? (
    <Check className="h-3.5 w-3.5 shrink-0 text-success" />
  ) : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "group flex min-h-[28px] items-center gap-3 rounded-md px-1 transition-colors",
        !isEditing && "hover:bg-muted/30",
        hideLabel && "justify-start",
        isTextareaField && !hideLabel && "items-start",
        containerClassName,
      )}
      onClick={handleStartEditing}
      onKeyDown={handleContainerKeyDown}
    >
      {/* Label column — fixed height, self-start so icon never shifts */}
      {hideLabel ? null : (
        <div className="flex h-7 w-[110px] shrink-0 items-center gap-2 self-start">
          {icon ? (
            <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground/40">
              {icon}
            </span>
          ) : null}
          <span className={cn("truncate text-sm leading-[20px] text-muted-foreground/70", labelClassName)}>{label}</span>
        </div>
      )}

      {/* Value column */}
      <div
        className={cn(
          "flex min-h-[20px] min-w-0 flex-1 items-center gap-1.5",
          !isEditing && isTextareaField && "items-start",
        )}
      >
        {/* --- Text / Number edit: inline chip --- */}
        {isEditing && !isSelectField && !isDateField && !isTextareaField ? (
          <div className="-ml-2 flex min-h-[24px] w-full items-center gap-1.5 rounded-md border border-border/50 px-2">
            <input
              ref={inputRef as RefObject<HTMLInputElement>}
              type={inputType ?? (type === "number" ? "number" : "text")}
              inputMode={type === "number" ? "decimal" : undefined}
              value={draft}
              disabled={isSaving}
              placeholder={label}
              className={cn(
                "w-full bg-transparent text-base leading-[20px] text-foreground/80 placeholder:text-muted-foreground/40 focus:outline-none sm:text-sm",
                editorClassName,
              )}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => { void handleCommit(draft); }}
              onKeyDown={handleInputKeyDown}
            />
            {isSaving ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground/50" /> : null}
          </div>
        ) : null}

        {/* --- Textarea edit: inline chip --- */}
        {isEditing && isTextareaField ? (
          <div className="-ml-2 flex w-full items-start rounded-md border border-border/50 px-2 py-1">
            <textarea
              ref={inputRef as RefObject<HTMLTextAreaElement>}
              rows={3}
              className={cn(
                "w-full resize-none bg-transparent text-base leading-[20px] text-foreground/80 placeholder:text-muted-foreground/40 focus:outline-none sm:text-sm",
                editorClassName,
              )}
              value={draft}
              disabled={isSaving}
              placeholder={label}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => { void handleCommit(draft); }}
              onKeyDown={handleInputKeyDown}
            />
            {isSaving ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground/50" /> : null}
          </div>
        ) : null}

        {/* --- Select edit: Popover portal dropdown --- */}
        {isEditing && isSelectField ? (
          <Popover
            open
            onOpenChange={(nextOpen) => {
              if (!nextOpen) {
                setIsEditing(false);
              }
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                className="-ml-2 flex min-h-[24px] items-center gap-1.5 rounded-md border border-border/50 px-2 text-sm leading-[20px] text-foreground/80"
              >
                {resolvedDisplayValue ?? label}
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" side="bottom" sideOffset={4} className="w-auto min-w-[180px] p-1">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between rounded-sm px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted/50",
                    option.value === draft && "bg-muted/40",
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    setDraft(option.value);
                    void handleCommit(option.value);
                  }}
                >
                  <span>{option.label}</span>
                  {option.value === currentValue ? (
                    <Check className="h-4 w-4 shrink-0 text-foreground/60" />
                  ) : null}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        ) : null}

        {/* --- Date edit: Popover calendar --- */}
        {isEditing && isDateField ? (
          <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="-ml-2 flex min-h-[24px] items-center gap-1.5 rounded-md border border-border/50 px-2 text-sm leading-[20px] text-foreground/80"
              >
                <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                {dateFromDraft ? format(dateFromDraft, "d MMM yyyy") : (
                  <span className="text-muted-foreground/40">{label}</span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start" side="bottom" sideOffset={4}>
              <Calendar
                mode="single"
                selected={dateFromDraft ?? undefined}
                onSelect={(nextDate) => {
                  if (!nextDate) return;
                  const serializedDate = toLocalIsoMidnight(nextDate);
                  setDraft(serializedDate);
                  void handleCommit(serializedDate);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        ) : null}

        {/* --- Display mode (all field types) --- */}
        {!isEditing ? (
          <>
            {displayElement}
            {statusIndicator}
          </>
        ) : null}
      </div>
    </div>
  );
}
