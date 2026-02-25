/**
 * Right pane showing list of document splits.
 * @module components/documents/split-results-pane
 */
import { AlertTriangle, ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SplitCard } from "./split-card";
import type { PageRange } from "@/types/documents";

/**
 * Extracts page reference from duplicate description.
 * "Copy of p.1" → "1", "Receipt for p.13-15" → "13-15"
 */
function extractPageRef(description: string): string | null {
  const match = description.match(/p\.(\d+(?:-\d+)?)/);
  return match ? match[1] : null;
}

/**
 * Formats page range as string (e.g., "3" or "3-5")
 */
function formatPageRange(start: number, end: number): string {
  return start === end ? `${start}` : `${start}-${end}`;
}

interface SplitResultsPaneProps {
  /** Array of splits to display */
  splits: PageRange[];
  /** Document type counts from tags JSONB */
  tags?: Record<string, number> | null;
  /** Callback when a split card is clicked */
  onPageClick: (page: number) => void;
  /** Callback to return to extraction view (only shown when extraction data exists) */
  onBackToExtraction?: () => void;
}

/**
 * Displays a scrollable list of split cards with header.
 */
export function SplitResultsPane({ splits, tags: _tags, onPageClick, onBackToExtraction }: SplitResultsPaneProps) {
  const duplicateSplits = splits.filter((s) => s.potential_duplicate);
  const label = splits.length === 1 ? "document" : "documents";

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-5 py-2 border-b border-border/40 bg-card">
        <div className="flex items-center gap-2">
          <div className="h-7 px-2.5 flex items-center">
            <FileText className="h-4 w-4 mr-2" />
            <span className="text-xs font-normal">{splits.length} {label}</span>
          </div>
          {duplicateSplits.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help">
                    <AlertTriangle className="h-4 w-4 text-warning/80" />
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-[280px]">
                  <p className="font-medium">Potential duplicates</p>
                  <ul className="text-xs text-background/70 mt-1 space-y-0.5">
                    {duplicateSplits.map((split, i) => {
                      const refPage = extractPageRef(split.potential_duplicate!);
                      const thisPage = formatPageRange(split.startPage, split.endPage);
                      return (
                        <li key={i}>
                          • p.{refPage} ↔ p.{thisPage}
                        </li>
                      );
                    })}
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <div className="flex-1" />
          {onBackToExtraction && (
            <Button
              variant="outline"
              size="sm"
              onClick={onBackToExtraction}
              className="h-7 px-2.5 text-xs font-normal border-border/50"
            >
              <ArrowLeft className="h-3 w-3 mr-1.5" />
              Back to Extraction
            </Button>
          )}
        </div>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {splits.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card p-12 text-center">
            <p className="text-muted-foreground">No splits found</p>
          </div>
        ) : (
          splits.map((split, index) => (
            <SplitCard key={index} split={split} onPageClick={onPageClick} />
          ))
        )}
      </div>
    </div>
  );
}
