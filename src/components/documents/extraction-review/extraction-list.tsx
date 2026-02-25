/**
 * @file Extraction list with multi-select field filtering
 * @description Scrollable list of extraction cards with document type navigator and field filters
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentNavigator } from "./document-navigator";
import { FieldFilter } from "./field-filter";
import { ExtractionCard } from "./extraction-card";
import { DuplicateIndicator } from "@/components/documents/duplicate-indicator";
import { type SplitExtraction } from "@/types/extraction";
import { computeFieldCounts, fieldMatchesFilters, type FieldFilters } from "@/lib/field-filter-utils";
import { useDismissRule } from "@/hooks/use-splits";

interface ExtractionListProps {
  /** Array of split extractions to display */
  splits: SplitExtraction[];
  /** Callback when a card header is clicked */
  onCardClick: (startPage: number) => void;
  /** Callback when a field value changes (enables editing) */
  onFieldValueChange?: (
    splitId: string,
    fieldName: string,
    newValue: unknown
  ) => void;
  /** Callback to switch to split view */
  onViewSplits?: () => void;
  /** Callback when a split is selected from navigator */
  onSplitSelect?: (splitId: string, startPage: number) => void;
}

/**
 * Checks if a split has any fields matching the active filters.
 * Used to show/hide entire cards when filtering.
 */
function splitHasMatchingFields(
  split: SplitExtraction,
  fieldFilters: FieldFilters
): boolean {
  // If no filters active, show all splits
  if (!fieldFilters.lowConfidence && !fieldFilters.needsReview && !fieldFilters.nonNull) {
    return true;
  }

  const data = split.extractedData ?? {};
  const meta = split.extractionMetadata ?? {};

  // Show card if ANY field matches any active filter
  return Object.entries(data).some(([fieldName, value]) =>
    fieldMatchesFilters(
      fieldName,
      value,
      meta[fieldName]?.ocrConfidence ?? null,
      split.validationFailures,
      fieldFilters,
      meta
    )
  );
}

/**
 * Derives duplicate status from splits.
 */
function deriveDuplicateStatus(splits: SplitExtraction[]): "none" | "detected" {
  return splits.some((s) => s.potentialDuplicate) ? "detected" : "none";
}

/**
 * Maps SplitExtraction to DuplicateIndicator's expected format.
 */
function mapSplitsForDuplicateIndicator(splits: SplitExtraction[]) {
  return splits.map((s) => ({
    startPage: s.startPage,
    endPage: s.endPage,
    potential_duplicate: s.potentialDuplicate,
  }));
}

/**
 * Scrollable list of extraction cards with document type counts and multi-select field filter.
 */
export function ExtractionList({
  splits,
  onCardClick,
  onFieldValueChange,
  onViewSplits,
  onSplitSelect,
}: ExtractionListProps) {
  const [fieldFilters, setFieldFilters] = useState<FieldFilters>({
    lowConfidence: false,
    needsReview: false,
    nonNull: false,
  });

  const dismissRuleMutation = useDismissRule();

  /**
   * Dismisses validation rules for a split (batched).
   */
  const handleDismissRule = useCallback(
    (splitId: string, ruleIds: string[]) => {
      const split = splits.find((s) => s.id === splitId);
      if (!split || ruleIds.length === 0) return;

      dismissRuleMutation.mutate({
        splitId,
        documentId: split.documentId,
        ruleIds,
      });
    },
    [splits, dismissRuleMutation]
  );

  // Compute field counts using shared utility (single pass)
  const fieldCounts = useMemo(
    () => computeFieldCounts(splits, fieldFilters),
    [splits, fieldFilters]
  );

  // Filter splits based on multi-select filter state
  const visibleSplits = useMemo(() => {
    return splits.filter((split) => splitHasMatchingFields(split, fieldFilters));
  }, [splits, fieldFilters]);

  // Progressive rendering: render cards in batches to avoid blocking main thread
  const [renderCount, setRenderCount] = useState(3);

  // Reset render count when splits change (new document loaded)
  useEffect(() => {
    setRenderCount(3);
  }, [splits]);

  // Progressively increase render count until all cards are visible
  useEffect(() => {
    if (renderCount < visibleSplits.length) {
      const id = setTimeout(() => setRenderCount((c) => c + 3), 0);
      return () => clearTimeout(id);
    }
  }, [renderCount, visibleSplits.length]);

  return (
    <div className="h-full flex flex-col">
      {/* Header with filters */}
      <div className="px-5 py-2 border-b border-border/40 bg-card">
        <div className="flex items-center gap-2">
          <DocumentNavigator
            splits={splits}
            onSplitSelect={onSplitSelect ?? ((_, startPage) => onCardClick(startPage))}
          />
          <FieldFilter
            filters={fieldFilters}
            onChange={setFieldFilters}
            counts={fieldCounts}
          />
          <DuplicateIndicator
            status={deriveDuplicateStatus(splits)}
            pageRanges={mapSplitsForDuplicateIndicator(splits)}
          />
          <div className="flex-1" />
          {onViewSplits && (
            <Button variant="outline" size="sm" onClick={onViewSplits} className="h-7 px-2.5 text-xs font-normal border-border/50">
              <Layers className="h-2 w-2 mr-1.5" />
              View splits
            </Button>
          )}
        </div>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {splits.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No extractions available
          </p>
        ) : visibleSplits.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No extractions match the current filter
          </p>
        ) : (
          visibleSplits.slice(0, renderCount).map((split) => (
            <ExtractionCard
              key={split.id}
              split={split}
              onCardClick={onCardClick}
              onFieldValueChange={onFieldValueChange}
              fieldFilters={fieldFilters}
              dismissedRuleIds={split.dismissedRuleIds ?? []}
              onDismissRule={handleDismissRule}
            />
          ))
        )}
      </div>
    </div>
  );
}
