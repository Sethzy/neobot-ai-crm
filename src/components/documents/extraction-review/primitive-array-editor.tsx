/**
 * @file Primitive array editor component
 * @description Single-column table editor for arrays of strings, numbers, or booleans
 */
import { useState, useMemo } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { isLowConfidence, type Citation, type FieldMetadata } from "@/types/extraction";
import { normalizeForComparison } from "@/lib/field-utils";
import { Filter } from "@/components/icons/lucide-compat";

interface PrimitiveArrayEditorProps {
  fieldName: string;
  value: (string | number | boolean | null)[] | null;
  /** Original value for edit detection (green tint on changed rows) */
  originalValue?: (string | number | boolean | null)[] | null;
  onChange?: (newArray: (string | number | boolean | null)[]) => void;
  disabled?: boolean;
  metadata?: Record<string, FieldMetadata> | null;
  onRowHover?: (citations: Citation[]) => void;
}

/**
 * Formats a primitive value for display.
 */
function formatPrimitiveValue(item: string | number | boolean | null): string {
  if (item === null) return "";
  if (typeof item === "boolean") return item ? "Yes" : "No";
  return String(item);
}

/**
 * Renders an array of primitive values as a single-column table.
 * Unlike ArrayFieldEditor (for objects), this shows one "Value" column.
 */
export function PrimitiveArrayEditor({
  fieldName,
  value,
  originalValue,
  onChange,
  disabled,
  metadata,
  onRowHover,
}: PrimitiveArrayEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showLowConfOnly, setShowLowConfOnly] = useState(false);

  const startEditing = (index: number, currentValue: string | number | boolean | null) => {
    if (disabled) return;
    setEditingIndex(index);
    setEditValue(String(currentValue ?? ""));
  };

  const saveEdit = () => {
    if (editingIndex === null || !value || !onChange) return;
    const newArray = [...value];
    newArray[editingIndex] = editValue;
    onChange(newArray);
    setEditingIndex(null);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditValue("");
  };

  /** Count of rows with low OCR confidence for aggregate display */
  const lowConfCount = useMemo(() => {
    if (!value || !metadata) return 0;
    return value.filter((_, i) => {
      const conf = metadata[`${fieldName}[${i}]`]?.ocrConfidence;
      return conf != null && isLowConfidence(conf);
    }).length;
  }, [value, metadata, fieldName]);

  /** Rows to display - all rows or filtered to low confidence only */
  const displayedRows = useMemo(() => {
    if (!value) return [];
    const indexed = value.map((item, i) => ({ item, idx: i }));
    if (!showLowConfOnly || !metadata) return indexed;
    return indexed.filter(({ idx }) => {
      const conf = metadata[`${fieldName}[${idx}]`]?.ocrConfidence;
      return conf != null && isLowConfidence(conf);
    });
  }, [value, showLowConfOnly, metadata, fieldName]);

  if (!value || value.length === 0) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-lg border border-border/30 bg-muted/30 px-3 py-2.5 text-sm">
        <span className="text-muted-foreground">Value is NULL</span>
      </div>
    );
  }

  return (
    <div className="border border-border/30 rounded-lg overflow-hidden">
      <table role="table" className="w-full">
        <thead className="bg-muted/40">
          <tr>
            <th className="w-12 px-3 py-2 text-xs font-medium text-left text-muted-foreground">#</th>
            <th className="px-3 py-2 text-xs font-medium text-left">Value</th>
          </tr>
        </thead>
        <tbody>
          {displayedRows.map(({ item, idx }) => {
            const rowKey = `${fieldName}[${idx}]`;
            const rowMeta = metadata?.[rowKey];
            const isEditing = editingIndex === idx;
            // Detect if row was edited - use normalizeForComparison for consistent empty value handling
            const originalItem = originalValue?.[idx];
            const isRowEdited = originalValue !== undefined &&
              JSON.stringify(normalizeForComparison(item)) !== JSON.stringify(normalizeForComparison(originalItem));

            return (
              <tr
                key={idx}
                className={cn(
                  "border-t border-border/20",
                  isRowEdited ? "bg-success/10" : "hover:bg-muted/20"
                )}
                onMouseEnter={() => onRowHover?.(rowMeta?.citations ?? [])}
                onMouseLeave={() => onRowHover?.([])}
              >
                <td className="px-3 py-2 text-sm text-muted-foreground">{idx + 1}</td>
                <td
                  className={cn(
                    "px-3 py-2 text-sm align-top",
                    !disabled && "cursor-pointer hover:bg-muted/30",
                    isEditing && "p-1"
                  )}
                  onClick={() => !isEditing && startEditing(idx, item)}
                >
                  {isEditing ? (
                    <Textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={(e) => {
                        // Cmd/Ctrl+Enter to save
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }
                        // Escape to cancel
                        if (e.key === "Escape") {
                          cancelEdit();
                        }
                      }}
                      autoFocus
                      className="min-h-[28px] text-sm p-1.5 resize-none"
                    />
                  ) : (
                    <span className="whitespace-pre-wrap break-words">
                      {formatPrimitiveValue(item)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-3 py-2 border-t border-border/20 bg-muted/20 text-xs text-muted-foreground flex items-center justify-between">
        <span>{value.length} {value.length === 1 ? "row" : "rows"}</span>
        {lowConfCount > 0 && (
          <Badge
            variant={showLowConfOnly ? "default" : "warning"}
            className="cursor-pointer gap-1"
            onClick={() => setShowLowConfOnly(!showLowConfOnly)}
          >
            <Filter className="h-3 w-3" />
            {showLowConfOnly ? "Show all" : `${lowConfCount} low conf`}
          </Badge>
        )}
      </div>
    </div>
  );
}
