/**
 * @file Extraction card for a single split
 * @description Displays split header and all extraction fields with metadata
 */
import { useCallback, memo, useMemo } from "react";
import { AlertTriangle } from "@/components/icons/lucide-compat";
import { formatTagLabel } from "@/lib/utils";
import { useSetHighlights } from "@/contexts/highlight-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ExtractionField } from "./extraction-field";
import { type SplitExtraction, type Citation } from "@/types/extraction";
import { citationsToHighlightAreas } from "@/lib/highlight-utils";
import { isCurrencyStructure, normalizeForComparison, type CurrencyValue } from "@/lib/field-utils";
import { fieldMatchesFilters, type FieldFilters } from "@/lib/field-filter-utils";

interface ExtractionCardProps {
  /** Split extraction data */
  split: SplitExtraction;
  /** Callback when card header is clicked */
  onCardClick: (startPage: number) => void;
  /** Callback when a field value changes (enables editing) */
  onFieldValueChange?: (splitId: string, fieldName: string, newValue: unknown) => void;
  /** Active field filters for filtering individual fields */
  fieldFilters?: FieldFilters;
  /** Rule IDs dismissed for this split */
  dismissedRuleIds?: string[];
  /** Callback when user dismisses validation rules (batched) - receives splitId for stable ref */
  onDismissRule?: (splitId: string, ruleIds: string[]) => void;
}

/**
 * Formats page range for display.
 */
function formatPageRange(startPage: number, endPage: number): string {
  if (startPage === endPage) return `Page ${startPage}`;
  return `Pages ${startPage}-${endPage}`;
}

/**
 * Infers field type from value for input rendering.
 * Detects currency objects from ExtendAI (including null currency objects).
 */
function inferFieldType(
  value: unknown
): "string" | "number" | "boolean" | "date" | "currency" {
  if (isCurrencyStructure(value)) return "currency";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  // Check for date string pattern YYYY-MM-DD
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return "date";
  return "string";
}

/**
 * Extracts field entries from extracted data for display.
 * Includes reasoning and citation texts from metadata.
 */
function getFieldEntries(
  extractedData: Record<string, unknown> | null,
  originalData: Record<string, unknown> | null,
  metadata: Record<
    string,
    {
      ocrConfidence?: number | null;
      citations?: unknown[];
      insights?: Array<{ type: string; content: string }>;
      description?: string;
    }
  > | null
): Array<{
  fieldName: string;
  value: unknown;
  originalValue: unknown;
  ocrConfidence: number | null;
  citations: Citation[];
  isEdited: boolean;
  reasoning: string | null;
  citationTexts: string[];
  description: string | null;
}> {
  if (!extractedData) return [];

  return Object.entries(extractedData).map(([fieldName, value]) => {
    const fieldMeta = metadata?.[fieldName];
    const originalValue = originalData?.[fieldName];

    // Extract reasoning from insights
    const reasoning =
      fieldMeta?.insights?.find((i) => i.type === "reasoning")?.content ?? null;

    // Extract citation texts
    const citationTexts =
      (fieldMeta?.citations as Citation[] | undefined)
        ?.map((c) => c.referenceText)
        .filter((t): t is string => Boolean(t)) ?? [];

    return {
      fieldName,
      value,
      originalValue,
      ocrConfidence: fieldMeta?.ocrConfidence ?? null,
      citations: (fieldMeta?.citations as Citation[]) ?? [],
      isEdited: JSON.stringify(normalizeForComparison(value)) !== JSON.stringify(normalizeForComparison(originalValue)),
      reasoning,
      citationTexts,
      description: fieldMeta?.description ?? null,
    };
  });
}

/**
 * Custom comparator for memo optimization.
 * Compares by value (not reference) to prevent re-renders when TanStack Query
 * returns new object references but data is unchanged.
 *
 * @returns true to SKIP re-render (props equal), false to RE-RENDER (props changed)
 */
export function arePropsEqual(
  prevProps: ExtractionCardProps,
  nextProps: ExtractionCardProps
): boolean {
  // Different card entirely - must re-render
  if (prevProps.split.id !== nextProps.split.id) return false;

  // Edit happened - extractedData changed
  if (
    JSON.stringify(prevProps.split.extractedData) !==
    JSON.stringify(nextProps.split.extractedData)
  ) {
    return false;
  }

  // Dismiss happened - dismissedRuleIds changed
  if (
    prevProps.dismissedRuleIds?.length !== nextProps.dismissedRuleIds?.length ||
    prevProps.dismissedRuleIds?.some((id, i) => id !== nextProps.dismissedRuleIds?.[i])
  ) {
    return false;
  }

  // Filter changed - affects visible fields
  if (
    prevProps.fieldFilters?.lowConfidence !== nextProps.fieldFilters?.lowConfidence ||
    prevProps.fieldFilters?.needsReview !== nextProps.fieldFilters?.needsReview ||
    prevProps.fieldFilters?.nonNull !== nextProps.fieldFilters?.nonNull
  ) {
    return false;
  }

  // All relevant props equal - skip re-render
  return true;
}

/**
 * Displays a split with header and extraction fields.
 * No orange background for needs review - uses badges only.
 */
export const ExtractionCard = memo(function ExtractionCard({
  split,
  onCardClick,
  onFieldValueChange,
  fieldFilters,
  dismissedRuleIds = [],
  onDismissRule,
}: ExtractionCardProps) {
  const { setHighlights } = useSetHighlights();

  const pageRange = formatPageRange(split.startPage, split.endPage);
  const tagLabel = formatTagLabel(split.tagId);
  const fields = useMemo(
    () => getFieldEntries(
      split.extractedData,
      split.originalExtractedData,
      split.extractionMetadata
    ),
    [split.extractedData, split.originalExtractedData, split.extractionMetadata]
  );

  // Filter fields based on active filters (pass full metadata for array row lookups)
  const visibleFields = fieldFilters
    ? fields.filter((f) =>
        fieldMatchesFilters(
          f.fieldName,
          f.value,
          f.ocrConfidence,
          split.validationFailures,
          fieldFilters,
          split.extractionMetadata // Full metadata for array row-level lookups
        )
      )
    : fields;

  // Wrap callback to compute highlights with split's dimensions
  const handleFieldHover = useCallback(
    (citations: Citation[]) => {
      const highlights = citationsToHighlightAreas(
        citations,
        split.pageWidth ?? 612, // US Letter fallback for old data
        split.pageHeight ?? 792
      );
      setHighlights(highlights);
    },
    [setHighlights, split.pageWidth, split.pageHeight]
  );

  /**
   * Wraps onFieldValueChange to reconstruct currency objects.
   * Handles partial currency updates (code or amount separately).
   */
  const handleValueChange = useCallback(
    (fieldName: string, newValue: unknown) => {
      if (!onFieldValueChange) return;

      // Check for partial currency update from CurrencyField
      const isCurrencyUpdate =
        typeof newValue === "object" &&
        newValue !== null &&
        "_currencyUpdate" in newValue;

      if (isCurrencyUpdate) {
        const update = newValue as unknown as { field: "code" | "amount"; value: string | number };
        // Get current value from extractedData (may already be edited)
        const currentValue = split.extractedData?.[fieldName] as {
          amount: number | null;
          iso_4217_currency_code: string | null;
        } | null;

        const reconstructed: CurrencyValue = {
          amount: update.field === "amount" ? (update.value as number) : (currentValue?.amount ?? null),
          iso_4217_currency_code:
            update.field === "code" ? (update.value as string) : (currentValue?.iso_4217_currency_code ?? null),
        };
        onFieldValueChange(split.id, fieldName, reconstructed);
        return;
      }

      // Legacy: direct number for currency (backwards compat)
      const originalValue = split.originalExtractedData?.[fieldName];
      if (isCurrencyStructure(originalValue) && typeof newValue === "number") {
        const original = originalValue as { amount: number | null; iso_4217_currency_code: string | null };
        const reconstructed: CurrencyValue = {
          amount: newValue,
          iso_4217_currency_code: original.iso_4217_currency_code ?? "SGD",
        };
        onFieldValueChange(split.id, fieldName, reconstructed);
      } else {
        onFieldValueChange(split.id, fieldName, newValue);
      }
    },
    [onFieldValueChange, split.id, split.extractedData, split.originalExtractedData]
  );

  return (
    <div id={`split-${split.id}`} className="rounded-xl border border-border/40 bg-card shadow-sm overflow-hidden">
      {/* Card Header */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b border-border/30 cursor-pointer bg-muted/70 hover:bg-muted transition-colors"
        onClick={() => onCardClick(split.startPage)}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-foreground">
            {tagLabel}
          </span>
          <span className="text-xs text-muted-foreground/70 font-mono tabular-nums">{pageRange}</span>
          {split.potentialDuplicate && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertTriangle className="h-4 w-4 text-warning/80" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[280px]">
                  <p className="font-medium">Potential duplicate</p>
                  <p className="text-xs text-background/70 mt-1">
                    {split.potentialDuplicate}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Extraction Fields */}
      <div className="divide-y divide-border/30">
        {visibleFields.map((field) => (
          <ExtractionField
            key={field.fieldName}
            fieldName={field.fieldName}
            label={formatTagLabel(field.fieldName)}
            description={field.description ?? undefined}
            value={field.value}
            originalValue={field.originalValue}
            ocrConfidence={field.ocrConfidence}
            citations={field.citations}
            isEdited={field.isEdited}
            onFieldHover={handleFieldHover}
            onValueChange={onFieldValueChange ? handleValueChange : undefined}
            fieldType={inferFieldType(field.value)}
            reasoning={field.reasoning}
            citationTexts={field.citationTexts}
            // Pass full metadata for array fields (row-level hover + confidence)
            extractionMetadata={Array.isArray(field.value) ? split.extractionMetadata : undefined}
            // Pass validation failures for field-level filtering
            validationFailures={split.validationFailures ?? []}
            dismissedRuleIds={dismissedRuleIds}
            onDismissRule={onDismissRule ? (ruleIds) => onDismissRule(split.id, ruleIds) : undefined}
          />
        ))}
        {visibleFields.length === 0 && (
          <div className="px-5 py-4 text-sm text-muted-foreground">
            No fields match the current filter
          </div>
        )}
      </div>
    </div>
  );
}, arePropsEqual);
