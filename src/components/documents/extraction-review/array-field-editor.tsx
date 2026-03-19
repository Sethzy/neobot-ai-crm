/**
 * @file Array field editor component
 * @description Table-based editor for array extraction fields with click-to-edit cells
 */
import { useState, useMemo } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { isLowConfidence } from "@/types/extraction";
import type { Citation, FieldMetadata } from "@/types/extraction";
import { normalizeForComparison } from "@/lib/field-utils";
import { Filter } from "@/components/icons/lucide-compat";

interface ArrayFieldEditorProps {
  fieldName: string;
  value: Record<string, unknown>[] | null;
  /** Original value for edit detection (green tint on changed rows) */
  originalValue?: Record<string, unknown>[] | null;
  onChange?: (newArray: Record<string, unknown>[]) => void;
  disabled?: boolean;
  /** Full extraction metadata for row-level lookups using `fieldName[i]` keys */
  metadata?: Record<string, FieldMetadata> | null;
  /** Callback for PDF highlighting - receives row citations on hover */
  onRowHover?: (citations: Citation[]) => void;
}

/**
 * Derives column names from all rows (not just first row).
 * Handles heterogeneous rows where later rows may have additional keys.
 */
function getColumnsFromData(value: Record<string, unknown>[]): string[] {
  return [...new Set(value.flatMap(Object.keys))];
}

/**
 * Renders an array of objects as an editable table.
 * Columns are derived from union of all object keys across all rows.
 */
export function ArrayFieldEditor({ fieldName, value, originalValue, onChange, disabled, metadata, onRowHover }: ArrayFieldEditorProps) {
  const [editingCell, setEditingCell] = useState<{
    row: number;
    col: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showLowConfOnly, setShowLowConfOnly] = useState(false);

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
    const indexed = value.map((row, i) => ({ row, idx: i }));
    if (!showLowConfOnly || !metadata) return indexed;
    return indexed.filter(({ idx }) => {
      const conf = metadata[`${fieldName}[${idx}]`]?.ocrConfidence;
      return conf != null && isLowConfidence(conf);
    });
  }, [value, showLowConfOnly, metadata, fieldName]);

  const isNullOrEmpty = !value || value.length === 0;

  if (isNullOrEmpty) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-lg border border-border/30 bg-muted/30 px-3 py-2.5 text-sm">
        <span className="text-muted-foreground">Value is NULL</span>
      </div>
    );
  }

  const columns = getColumnsFromData(value);

  const startEditing = (rowIndex: number, col: string, currentValue: unknown) => {
    if (disabled) return;
    setEditingCell({ row: rowIndex, col });
    setEditValue(String(currentValue ?? ""));
  };

  const saveEdit = () => {
    if (!editingCell || !value || !onChange) return;
    const { row, col } = editingCell;
    const newArray = [...value];
    newArray[row] = { ...newArray[row], [col]: editValue };
    onChange(newArray);
    setEditingCell(null);
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  return (
    <div className="border border-border/30 rounded-lg overflow-hidden">
      <table role="table" className="w-full">
        <thead className="bg-muted/40">
          <tr>
            <th className="w-12 px-3 py-2 text-xs font-medium text-left text-muted-foreground">#</th>
            {columns.map((col) => (
              <th key={col} className="px-3 py-2 text-xs font-medium text-left">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayedRows.map(({ row, idx }) => {
            // Detect if row was edited by comparing to original (normalize to treat "", null as equivalent)
            const originalRow = originalValue?.[idx];
            const isRowEdited = originalValue !== undefined &&
              JSON.stringify(normalizeForComparison(row)) !== JSON.stringify(normalizeForComparison(originalRow));

            return (
            <tr
              key={idx}
              className={cn(
                "border-t border-border/20",
                isRowEdited ? "bg-success/10" : "hover:bg-muted/20"
              )}
              onMouseEnter={() => {
                const rowKey = `${fieldName}[${idx}]`;
                const rowMeta = metadata?.[rowKey];
                onRowHover?.(rowMeta?.citations ?? []);
              }}
              onMouseLeave={() => onRowHover?.([])}
            >
              <td className="px-3 py-2 text-sm text-muted-foreground">{idx + 1}</td>
              {columns.map((col) => {
                const isEditing =
                  editingCell?.row === idx && editingCell?.col === col;
                return (
                  <td
                    key={col}
                    className={cn(
                      "px-3 py-2 text-sm align-top",
                      !disabled && "cursor-pointer hover:bg-muted/30",
                      isEditing && "p-1"
                    )}
                    onClick={() => !isEditing && startEditing(idx, col, row[col])}
                  >
                    {isEditing ? (
                      <Textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={saveEdit}
                        onKeyDown={(e) => {
                          // Cmd/Ctrl+Enter to save (Enter inserts newline in textarea)
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
                        {String(row[col] ?? "")}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-3 py-2 border-t border-border/20 bg-muted/20 text-xs text-muted-foreground flex items-center justify-between">
        <span>{value?.length ?? 0} rows</span>
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
