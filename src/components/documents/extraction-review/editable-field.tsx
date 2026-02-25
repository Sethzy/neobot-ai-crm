/**
 * @file Editable field input component
 * @description Renders appropriate input based on field type. Saves on blur.
 */
import { useState, useCallback } from "react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Supported field types for editing */
export type FieldType = "string" | "number" | "boolean" | "date";

interface EditableFieldProps {
  /** Field key from extraction schema */
  fieldName: string;
  /** Current field value */
  value: unknown;
  /** Type of field for input rendering */
  fieldType: FieldType;
  /** Callback when value changes (called on blur) */
  onChange: (fieldName: string, newValue: unknown) => void;
}

/**
 * Renders an editable input based on field type.
 * Auto-saves on blur by calling onChange.
 */
export function EditableField({
  fieldName,
  value,
  fieldType,
  onChange,
}: EditableFieldProps) {
  // Local state for controlled input
  const [localValue, setLocalValue] = useState(value);

  const handleBlur = useCallback(() => {
    // Only trigger onChange if value actually changed
    if (localValue !== value) {
      onChange(fieldName, localValue);
    }
  }, [fieldName, localValue, value, onChange]);

  if (fieldType === "boolean") {
    return (
      <Checkbox
        checked={Boolean(localValue)}
        onCheckedChange={(checked) => {
          setLocalValue(checked);
          onChange(fieldName, checked);
        }}
      />
    );
  }

  if (fieldType === "number") {
    return (
      <Input
        type="number"
        value={localValue as number ?? ""}
        onChange={(e) => setLocalValue(e.target.valueAsNumber || null)}
        onBlur={handleBlur}
        className="h-10 text-xs text-foreground/80 px-3 border-border focus-visible:border-border shadow-sm focus-visible:ring-1"
      />
    );
  }

  if (fieldType === "date") {
    const dateValue = localValue ? new Date(localValue as string) : undefined;
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "h-10 w-full justify-start text-left text-xs font-normal px-3 border-border shadow-sm",
              !localValue && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
            {dateValue ? format(dateValue, "d MMM yyyy") : "Select date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dateValue}
            onSelect={(date) => {
              const newValue = date ? format(date, "yyyy-MM-dd") : null;
              setLocalValue(newValue);
              if (newValue !== value) {
                onChange(fieldName, newValue);
              }
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    );
  }

  // Default: string type
  return (
    <Input
      type="text"
      value={(localValue as string) ?? ""}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      className="h-10 text-xs text-foreground/80 px-3 border-border focus-visible:border-border shadow-sm focus-visible:ring-1"
    />
  );
}
