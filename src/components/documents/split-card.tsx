/**
 * Card displaying a single document split (page range).
 * @module components/documents/split-card
 */
import { useState } from "react";
import { AlertTriangle, ChevronRight, ChevronDown } from "@/components/icons/lucide-compat";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PageRange } from "@/types/documents";

interface SplitCardProps {
  /** The split data to display */
  split: PageRange;
  /** Callback when card is clicked, receives startPage */
  onPageClick: (page: number) => void;
}

/**
 * Formats type ID as display label.
 * Capitalizes first letter and replaces underscores with spaces.
 */
function formatTypeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ");
}

/**
 * Displays a split with type badge, page range, and metadata.
 */
export function SplitCard({ split, onPageClick }: SplitCardProps) {
  const [notesExpanded, setNotesExpanded] = useState(false);
  const typeLabel = formatTypeLabel(split.type);
  const pageLabel =
    split.startPage === split.endPage
      ? `Page ${split.startPage}`
      : `Pages ${split.startPage} - ${split.endPage}`;

  return (
    <div className="rounded-xl border border-border/40 bg-card shadow-sm overflow-hidden">
      {/* Card Header - grey background like extraction-card */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b border-border/30 cursor-pointer bg-muted/70 hover:bg-muted transition-colors"
        onClick={() => onPageClick(split.startPage)}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-foreground">{typeLabel}</span>
          <span className="text-xs text-muted-foreground/70 font-mono tabular-nums">{pageLabel}</span>
          {split.potential_duplicate && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help">
                    <AlertTriangle className="h-4 w-4 text-warning/80" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {split.potential_duplicate}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Card Body */}
      <div className="px-5 py-4">
        {split.identifier && (
          <p className="text-xs text-foreground/80">Identifier: {split.identifier}</p>
        )}
        {split.document_date && (
          <p className="text-xs text-foreground/80 mt-1">
            Date: {new Date(split.document_date).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        )}
        {split.potential_duplicate && (
          <p className="text-xs text-warning mt-2">{split.potential_duplicate}</p>
        )}

        {/* Notes accordion */}
        <div className="mt-3 pt-3 border-t border-border/30">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-foreground/80 hover:text-foreground transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setNotesExpanded(!notesExpanded);
            }}
          >
            {notesExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            Notes
          </button>
          {notesExpanded && (
            <p className="mt-2 px-3 py-2.5 bg-[#F9FAFB] rounded-lg text-xs text-foreground/80 leading-relaxed">
              {split.observation}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
