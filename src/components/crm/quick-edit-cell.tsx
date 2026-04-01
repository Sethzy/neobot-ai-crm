/**
 * Compact inline editor for dense CRM list and board surfaces.
 * Hover reveals copy + edit icons; clicking edit transforms the cell in-place.
 * @module components/crm/quick-edit-cell
 */
"use client";

import { Check, Copy, Loader2, Pencil } from "@/components/icons/lucide-compat";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { type KeyboardEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type QuickEditCellType = "text" | "number" | "select" | "date";

type ParsedQuickEditValue =
  | { ok: true; value: string | number | null }
  | { ok: false; message: string };

interface QuickEditOption {
  value: string;
  label: string;
}

interface QuickEditCellProps {
  /** Accessible field label used for the editor and edit button. */
  ariaLabel: string;
  /** Persisted value used for display and editor initialization. */
  value: string | number | null;
  /** Optional display value when the rendered label differs from the stored value. */
  displayValue?: string | null;
  /** Hides the read-mode value when the parent renders it separately. */
  hideDisplayValue?: boolean;
  /** Editor type for the compact field. */
  type?: QuickEditCellType;
  /** Optional HTML input type for text-based fields. */
  inputType?: React.HTMLInputTypeAttribute;
  /** Select options when `type="select"`. */
  options?: QuickEditOption[];
  /** Optional parser used before saving. */
  parseValue?: (draft: string) => ParsedQuickEditValue;
  /** Called after a parsed value is ready to persist. */
  onSave: (value: string | number | null) => Promise<void> | void;
  /**
   * Custom read-mode content (e.g. a link or badge) rendered by the parent.
   * When provided, this replaces the default display span and is hidden during edit mode
   * so the input can take over the full cell width without doubling up.
   */
  children?: React.ReactNode;
}

const savedIndicatorDurationMs = 1500;

function parseDateValue(value: string): Date | null {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
}

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

function toDateInputValue(value: string | number | null): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "";
  }

  const parsedDate = parseDateValue(value);

  if (!parsedDate) {
    return "";
  }

  return format(parsedDate, "yyyy-MM-dd");
}

function toDraftValue(value: string | number | null, type: QuickEditCellType): string {
  if (type === "date") {
    return toDateInputValue(value);
  }

  if (value == null) {
    return "";
  }

  return String(value);
}

function resolveDisplayValue(
  value: string | number | null,
  displayValue: string | null | undefined,
  type: QuickEditCellType,
  options: QuickEditOption[],
): string {
  if (displayValue !== undefined) {
    const normalizedDisplayValue = displayValue?.trim();
    return normalizedDisplayValue && normalizedDisplayValue.length > 0 ? normalizedDisplayValue : "";
  }

  if (value == null || value === "") {
    return "";
  }

  if (type === "select" && typeof value === "string") {
    return options.find((option) => option.value === value)?.label ?? value;
  }

  if (type === "date" && typeof value === "string") {
    const parsedDate = parseDateValue(value);
    return parsedDate ? format(parsedDate, "d MMM yyyy") : value;
  }

  return String(value);
}

function defaultParseValue(type: QuickEditCellType, draft: string): ParsedQuickEditValue {
  const normalizedDraft = draft.trim();

  if (type === "number") {
    if (normalizedDraft.length === 0) {
      return { ok: true, value: null };
    }

    const numericValue = Number(normalizedDraft);

    if (Number.isNaN(numericValue)) {
      return { ok: false, message: "Enter a valid number" };
    }

    return { ok: true, value: numericValue };
  }

  if (type === "date") {
    if (normalizedDraft.length === 0) {
      return { ok: true, value: null };
    }

    const parsedDate = new Date(`${normalizedDraft}T00:00:00`);

    if (Number.isNaN(parsedDate.getTime())) {
      return { ok: false, message: "Enter a valid date" };
    }

    return { ok: true, value: toLocalIsoMidnight(parsedDate) };
  }

  return { ok: true, value: normalizedDraft.length > 0 ? normalizedDraft : null };
}

function stopEventPropagation(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

export function QuickEditCell({
  ariaLabel,
  value,
  displayValue,
  hideDisplayValue = false,
  type = "text",
  inputType,
  options = [],
  parseValue,
  onSave,
  children,
}: QuickEditCellProps) {
  const isMobile = useIsMobile();
  const inputRef = useRef<HTMLInputElement>(null);
  const savedTimerRef = useRef<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [draft, setDraft] = useState(() => toDraftValue(value, type));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resolvedDisplayValue = useMemo(
    () => resolveDisplayValue(value, displayValue, type, options),
    [displayValue, options, type, value],
  );

  const hasCopyableValue = value != null && value !== "";

  useEffect(() => {
    if (!isEditing) {
      setDraft(toDraftValue(value, type));
      setErrorMessage(null);
    }
  }, [isEditing, type, value]);

  useEffect(() => {
    if (isEditing && !isMobile && (type === "text" || type === "number" || type === "date")) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing, isMobile, type]);

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

  const handleCopy = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();

      if (!hasCopyableValue) {
        return;
      }

      void navigator.clipboard.writeText(String(value)).then(() => {
        toast(`${ariaLabel} copied to clipboard`);
      });
    },
    [ariaLabel, hasCopyableValue, value],
  );

  const startEditing = useCallback(() => {
    setDraft(toDraftValue(value, type));
    setErrorMessage(null);
    setIsEditing(true);
  }, [type, value]);

  const cancelEditing = useCallback(() => {
    setDraft(toDraftValue(value, type));
    setErrorMessage(null);
    setIsEditing(false);
  }, [type, value]);

  const commitValue = useCallback(
    async (nextDraft: string) => {
      if (isSaving) {
        return;
      }

      const parser = parseValue ?? ((draftValue: string) => defaultParseValue(type, draftValue));
      const parsedValue = parser(nextDraft);

      if (!parsedValue.ok) {
        setErrorMessage(parsedValue.message);
        return;
      }

      const normalizedCurrentValue = defaultParseValue(type, toDraftValue(value, type));

      if (
        normalizedCurrentValue.ok &&
        normalizedCurrentValue.value === parsedValue.value
      ) {
        setErrorMessage(null);
        setIsEditing(false);
        return;
      }

      setErrorMessage(null);
      setIsSaving(true);

      try {
        await onSave(parsedValue.value);
        setIsEditing(false);
        setSavedIndicator();
      } catch (error) {
        if (error instanceof Error && error.message.trim().length > 0) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage(`Unable to save ${ariaLabel.toLowerCase()}.`);
        }
      } finally {
        setIsSaving(false);
      }
    },
    [ariaLabel, isSaving, onSave, parseValue, setSavedIndicator, type, value],
  );

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelEditing();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        void commitValue(draft);
      }
    },
    [cancelEditing, commitValue, draft],
  );

  const renderEditor = (isDialogEditor: boolean) => {
    if (type === "select") {
      if (isDialogEditor) {
        return (
          <Select
            value={draft || undefined}
            onValueChange={(nextValue) => {
              setDraft(nextValue);
            }}
          >
            <SelectTrigger aria-label={ariaLabel} className="w-full">
              <SelectValue placeholder={`Select ${ariaLabel.toLowerCase()}`} />
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

      return (
        <Popover open onOpenChange={(nextOpen) => !nextOpen && cancelEditing()}>
          <PopoverTrigger asChild>
            <span className="block w-full" />
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] min-w-[180px] p-0"
            align="start"
            sideOffset={-20}
            onClick={stopEventPropagation}
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <Command>
              <CommandInput placeholder={`Search ${ariaLabel.toLowerCase()}...`} />
              <CommandList>
                <CommandEmpty>No results.</CommandEmpty>
                <CommandGroup>
                  {options.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.label}
                      data-checked={option.value === (draft || value)}
                      onSelect={() => {
                        setDraft(option.value);
                        void commitValue(option.value);
                      }}
                    >
                      {option.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      );
    }

    if (type === "date") {
      return (
        <div className="space-y-2" onClick={stopEventPropagation}>
          <div className="flex items-center gap-1">
            <Input
              ref={inputRef}
              aria-label={ariaLabel}
              type="date"
              className="h-7 text-sm"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleInputKeyDown}
              onBlur={(event) => {
                if (!isDialogEditor) {
                  void commitValue(event.currentTarget.value);
                }
              }}
            />
            {!isDialogEditor ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Save ${ariaLabel}`}
                disabled={isSaving}
                onClick={(event) => {
                  event.stopPropagation();
                  void commitValue(draft);
                }}
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
              </Button>
            ) : null}
          </div>
          {!isDialogEditor && draft ? (
            <div className="rounded-md border border-border/60 p-1">
              <Calendar
                mode="single"
                selected={new Date(`${draft}T00:00:00`)}
                onSelect={(nextDate) => {
                  if (!nextDate) {
                    return;
                  }

                  const nextDraft = format(nextDate, "yyyy-MM-dd");
                  setDraft(nextDraft);
                  void commitValue(nextDraft);
                }}
              />
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div
        className="flex items-center gap-1"
        onBlur={(event) => {
          if (!isDialogEditor && !event.currentTarget.contains(event.relatedTarget as Node)) {
            cancelEditing();
          }
        }}
      >
        <Input
          ref={inputRef}
          aria-label={ariaLabel}
          type={inputType ?? (type === "number" ? "number" : "text")}
          className="h-7 text-sm"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleInputKeyDown}
          onClick={stopEventPropagation}
        />
        {!isDialogEditor ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Save ${ariaLabel}`}
            disabled={isSaving}
            onClick={(event) => {
              event.stopPropagation();
              void commitValue(draft);
            }}
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
          </Button>
        ) : null}
      </div>
    );
  };

  const isDesktopEditing = isEditing && !isMobile;

  return (
    <div
      className="flex min-w-0 items-center gap-1"
      onClick={stopEventPropagation}
    >
      {isDesktopEditing ? (
        <div className="min-w-0 flex-1 space-y-1">
          {renderEditor(false)}
          {errorMessage ? (
            <p className="text-xs text-destructive">{errorMessage}</p>
          ) : null}
        </div>
      ) : (
        <>
          {children ? (
            <span className="min-w-0 flex-1 truncate">{children}</span>
          ) : !hideDisplayValue ? (
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm",
                !resolvedDisplayValue ? "text-muted-foreground" : "text-foreground",
              )}
              title={resolvedDisplayValue || undefined}
            >
              {resolvedDisplayValue}
            </span>
          ) : null}

          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : isSaved ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-label={`${ariaLabel} saved`} />
          ) : (
            <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
              {hasCopyableValue ? (
                <button
                  type="button"
                  className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-foreground/70"
                  aria-label={`Copy ${ariaLabel}`}
                  onClick={handleCopy}
                >
                  <Copy className="h-3 w-3" />
                </button>
              ) : null}
              <button
                type="button"
                className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-foreground/70"
                aria-label={`Edit ${ariaLabel}`}
                onClick={(event) => {
                  event.stopPropagation();
                  startEditing();
                }}
              >
                <Pencil className="h-3 w-3" />
              </button>
            </span>
          )}
        </>
      )}

      <Dialog open={isEditing && isMobile} onOpenChange={(nextOpen) => !nextOpen && cancelEditing()}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Edit {ariaLabel}</DialogTitle>
            <DialogDescription>
              Update the {ariaLabel.toLowerCase()} value without leaving this page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {renderEditor(true)}
            {errorMessage ? (
              <p className="text-sm text-destructive">{errorMessage}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={cancelEditing}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void commitValue(draft)}
              disabled={isSaving}
              aria-label={`Save ${ariaLabel}`}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
