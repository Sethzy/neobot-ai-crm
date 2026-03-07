/**
 * @file Document navigator popover
 * @description Lists all splits with type + page range. Click to navigate.
 */
import { useState } from "react";
import { FileText, ChevronDown, AlertTriangle } from "@/components/icons/lucide-compat";
import { formatDuplicateDescription } from "@/components/documents/duplicate-indicator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { SplitExtraction } from "@/types/extraction";

interface DocumentNavigatorProps {
  /** Array of splits to display */
  splits: SplitExtraction[];
  /** Callback when a split is selected */
  onSplitSelect: (splitId: string, startPage: number) => void;
}

/**
 * Formats tag ID as display label.
 * Capitalizes first letter and replaces underscores with spaces.
 */
function formatTypeLabel(tagId: string): string {
  return tagId.charAt(0).toUpperCase() + tagId.slice(1).replace(/_/g, " ");
}

/**
 * Formats page range for display.
 */
function formatPageRange(startPage: number, endPage: number): string {
  if (startPage === endPage) return `Page ${startPage}`;
  return `Pages ${startPage}-${endPage}`;
}

/**
 * Popover showing all documents. Click to navigate PDF + extraction panel.
 */
export function DocumentNavigator({
  splits,
  onSplitSelect,
}: DocumentNavigatorProps) {
  const [open, setOpen] = useState(false);
  const totalCount = splits.length;
  const label = totalCount === 1 ? "document" : "documents";

  // Sort splits by startPage
  const sortedSplits = [...splits].sort((a, b) => a.startPage - b.startPage);

  const handleSelect = (splitId: string, startPage: number) => {
    onSplitSelect(splitId, startPage);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-xs font-normal border-border/50"
        >
          <FileText className="h-2 w-2 mr-1.5" />
          {totalCount} {label}
          <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5 border-border/40 shadow-md">
        <div className="relative">
          <div className="flex flex-col max-h-[540px] overflow-y-auto">
            {sortedSplits.map((split) => (
              <button
                key={split.id}
                onClick={() => handleSelect(split.id, split.startPage)}
                className="flex flex-col items-start px-3 py-2.5 text-sm rounded-lg hover:bg-muted/40 text-left w-full transition-colors"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground/90">{formatTypeLabel(split.tagId)}</span>
                    {split.potentialDuplicate && (
                      <AlertTriangle className="h-3 w-3 text-warning/80 flex-shrink-0" />
                    )}
                  </div>
                  <span className="text-muted-foreground/70 text-xs">
                    {formatPageRange(split.startPage, split.endPage)}
                  </span>
                </div>
                {split.potentialDuplicate && (
                  <span className="text-xs text-warning/80 mt-0.5">
                    {formatDuplicateDescription(split.potentialDuplicate)}
                  </span>
                )}
              </button>
            ))}
          </div>
          {/* Gradient fade hints more content below */}
          {sortedSplits.length > 15 && (
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none rounded-b-lg" />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
