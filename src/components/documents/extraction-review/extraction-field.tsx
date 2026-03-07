/**
 * @file Single extraction field display with optional editing
 * @description Shows field value with confidence badge, reasoning, citations, and hover support
 */
import { Lightbulb, X } from "@/components/icons/lucide-compat";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isLowConfidence, type Citation, type FieldMetadata } from "@/types/extraction";
import type { ValidationFailure } from "@/config/types";
import { EditableField, type FieldType } from "./editable-field";
import { unwrapFieldValue, isCurrencyStructure, getArrayItemType, normalizeForComparison } from "@/lib/field-utils";
import { failureAppliesToField } from "@/lib/field-filter-utils";
import { ArrayFieldEditor } from "./array-field-editor";
import { PrimitiveArrayEditor } from "./primitive-array-editor";
import { CurrencyField } from "./currency-field";

/**
 * Formats a snake_case key to Title Case for nested field labels.
 */
function formatNestedLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ExtractionFieldProps {
  /** Field key from extraction schema */
  fieldName: string;
  /** Human-readable label */
  label: string;
  /** Field description from schema */
  description?: string;
  /** Current value (may be edited) */
  value: unknown;
  /** Original value for row-level edit detection in arrays */
  originalValue?: unknown;
  /** OCR confidence score (0-1) */
  ocrConfidence: number | null;
  /** Source citations with bounding boxes */
  citations: Citation[];
  /** Whether value differs from originalValue */
  isEdited: boolean;
  /** Callback when card is hovered (for highlighting) */
  onFieldHover: (citations: Citation[]) => void;
  /** Callback when value changes (makes field editable) */
  onValueChange?: (fieldName: string, newValue: unknown) => void;
  /** Field type for input rendering and badge */
  fieldType?: FieldType | "currency";
  /** AI reasoning text */
  reasoning?: string | null;
  /** Citation text snippets */
  citationTexts?: string[];
  /** Full extraction metadata for array row lookups (passed only for arrays) */
  extractionMetadata?: Record<string, FieldMetadata> | null;
  /** Validation failures for filtering (parent passes all, component filters by field) */
  validationFailures?: ValidationFailure[];
  /** Rule IDs that user has dismissed */
  dismissedRuleIds?: string[];
  /** Callback when user dismisses validation rules (batched) */
  onDismissRule?: (ruleIds: string[]) => void;
}

/**
 * Displays a single extraction field with new layout.
 * Shows field name, description, status badges, value, reasoning, and citations.
 */
export function ExtractionField({
  fieldName,
  label,
  description,
  value,
  originalValue,
  ocrConfidence,
  citations,
  isEdited,
  onFieldHover,
  onValueChange,
  fieldType = "string",
  reasoning,
  citationTexts = [],
  extractionMetadata,
  validationFailures = [],
  dismissedRuleIds = [],
  onDismissRule,
}: ExtractionFieldProps) {
  const lowConfidence = isLowConfidence(ocrConfidence);
  const isEditable = !!onValueChange;
  const unwrapped = unwrapFieldValue(value);

  // Detect arrays for special rendering
  const isArrayValue = Array.isArray(value);
  // Detect array item type for routing
  const arrayItemType = isArrayValue ? getArrayItemType(value as unknown[]) : null;

  // Detect plain objects (not array, not currency) for nested rendering
  // Use isCurrencyStructure to catch all currency shapes (valid, null, partial)
  const isPlainObject = typeof value === "object" && value !== null &&
    !isArrayValue && !isCurrencyStructure(value);

  // Complex objects (excluding arrays and currency) are not editable inline
  const isComplexValue = isArrayValue || isPlainObject;

  // Filter validation failures for this specific field (uses prefix matching for nested fields)
  const fieldFailures = validationFailures.filter((f) => failureAppliesToField(f, fieldName));
  // Filter out dismissed rules for badge display
  const undismissedFailures = fieldFailures.filter(
    (f) => !dismissedRuleIds.includes(f.ruleId)
  );
  const showNeedsReview = undismissedFailures.length > 0;
  // Show "Reviewed" badge when there are dismissed failures for this field
  const dismissedFailures = fieldFailures.filter(
    (f) => dismissedRuleIds.includes(f.ruleId)
  );
  const showReviewed = dismissedFailures.length > 0 && !showNeedsReview;


  // Badge logic:
  // - Corrected: field was edited (value differs from original)
  // - Low confidence: only show if not edited (editing "corrects" low confidence)
  // - Not found: only show if not edited (editing a not-found field shows "Corrected" instead)
  // - Needs review: validation failed AND not dismissed (handled separately below)
  const showLowConfidence = lowConfidence && !isEdited;
  const showCorrected = isEdited;
  const showNotFound = unwrapped.isNotFound && !isEdited;

  return (
    <div
      data-testid="extraction-field-card"
      data-field-name={fieldName}
      className={cn(
        "px-5 py-4 transition-colors border-2 border-transparent",
        "hover:border-[#808BF8]/60"
      )}
      onMouseEnter={() => onFieldHover(citations)}
      onMouseLeave={() => onFieldHover([])}
    >
      {/* Header: field name */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground/80">{label}</span>
      </div>

      {/* Description */}
      {description && (
        <p className="text-xs text-muted-foreground/70 mt-2 leading-relaxed">{description}</p>
      )}

      {/* Status badges + OCR confidence */}
      <div className="flex items-center gap-2 mt-3">
        {showNotFound && <Badge variant="warning" className="text-[10px] transition-none">Not found</Badge>}
        {showLowConfidence && <Badge variant="warning" className="text-[10px] transition-none">Low confidence</Badge>}
        {showCorrected && <Badge variant="success" className="text-[10px] transition-none">Corrected</Badge>}
        {showReviewed && <Badge className="text-[10px] bg-muted text-muted-foreground border-0 transition-none">Reviewed</Badge>}
        {/* ocrConfidence badge removed - redundant with "Low confidence" badge */}
        {showNeedsReview && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  className="text-[10px] bg-red-50 text-red-600/80 border-0 cursor-default hover:bg-red-100 flex items-center gap-1 transition-none"
                >
                  Needs review
                  {onDismissRule && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Dismiss all undismissed failures for this field (batched)
                        onDismissRule(undismissedFailures.map((f) => f.ruleId));
                      }}
                      className="ml-0.5 p-0.5 hover:bg-red-200/60 rounded"
                      aria-label="Dismiss all validation failures"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px]" align="start">
                <p className="text-xs font-medium">Validation failures:</p>
                <ul className="text-xs mt-1 space-y-1">
                  {undismissedFailures.map((f) => (
                    <li key={f.ruleId}>
                      <span className="font-medium">{f.ruleName}:</span> {f.message}
                      {f.description && (
                        <p className="text-background/70 mt-0.5">{f.description}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Value input - currency fields show badge + number for Excel compatibility */}
      <div className="mt-3">
        {isArrayValue && arrayItemType === "object" ? (
          <ArrayFieldEditor
            fieldName={fieldName}
            value={value as Record<string, unknown>[] | null}
            originalValue={originalValue as Record<string, unknown>[] | undefined}
            onChange={onValueChange ? (newArray) => onValueChange(fieldName, newArray) : undefined}
            metadata={extractionMetadata ?? undefined}
            onRowHover={onFieldHover}
          />
        ) : isArrayValue && arrayItemType === "primitive" ? (
          <PrimitiveArrayEditor
            fieldName={fieldName}
            value={value as (string | number | boolean | null)[]}
            originalValue={originalValue as (string | number | boolean | null)[] | undefined}
            onChange={onValueChange ? (newArray) => onValueChange(fieldName, newArray) : undefined}
            metadata={extractionMetadata ?? undefined}
            onRowHover={onFieldHover}
          />
        ) : isArrayValue && arrayItemType === "empty" ? (
          <PrimitiveArrayEditor
            fieldName={fieldName}
            value={[]}
            originalValue={originalValue as (string | number | boolean | null)[] | undefined}
            onChange={onValueChange ? (newArray) => onValueChange(fieldName, newArray) : undefined}
          />
        ) : isPlainObject ? (
          <div className="pl-4 border-l-2 border-border/30 space-y-2">
            {Object.entries(value as Record<string, unknown>).map(([key, childValue]) => {
              const childOriginalValue = (originalValue as Record<string, unknown> | undefined)?.[key];
              // Use normalizeForComparison for consistent empty value handling (treats "", null, undefined as equivalent)
              const childIsEdited = JSON.stringify(normalizeForComparison(childValue)) !==
                JSON.stringify(normalizeForComparison(childOriginalValue));
              return (
                <ExtractionField
                  key={key}
                  fieldName={`${fieldName}.${key}`}
                  label={formatNestedLabel(key)}
                  value={childValue}
                  originalValue={childOriginalValue}
                  ocrConfidence={ocrConfidence}
                  citations={[]}
                  isEdited={childIsEdited}
                  onFieldHover={onFieldHover}
                  onValueChange={onValueChange ? (_, newVal) => {
                    onValueChange(fieldName, { ...(value as Record<string, unknown>), [key]: newVal });
                  } : undefined}
                  validationFailures={validationFailures}
                />
              );
            })}
          </div>
        ) : unwrapped.isCurrency ? (
          <CurrencyField
            currencyCode={unwrapped.currencyCode}
            amount={unwrapped.rawValue as number | null}
            onCurrencyChange={
              isEditable
                ? (code) => onValueChange?.(fieldName, { _currencyUpdate: true, field: "code", value: code })
                : undefined
            }
            onAmountChange={
              isEditable
                ? (amt) => onValueChange?.(fieldName, { _currencyUpdate: true, field: "amount", value: amt })
                : undefined
            }
            readOnly={!isEditable}
          />
        ) : isEditable && !isComplexValue ? (
          <EditableField
            fieldName={fieldName}
            value={unwrapped.rawValue}
            fieldType={fieldType === "currency" ? "number" : fieldType}
            onChange={onValueChange}
          />
        ) : (
          <div className="px-3 py-2.5 bg-[#F9FAFB] rounded-lg text-sm whitespace-pre-wrap border border-border/30">
            {unwrapped.displayValue}
          </div>
        )}
      </div>

      {/* Reasoning section */}
      {reasoning && (
        <div className="mt-3 p-3 bg-white rounded-lg border border-border/40">
          <Badge variant="info" className="text-[10px] mb-2 gap-1">
            <Lightbulb className="h-3 w-3" />
            Reasoning
          </Badge>
          <div className="px-3 py-2 bg-[#F9FAFB] rounded-md">
            <p className="text-xs text-foreground/80 leading-relaxed">{reasoning}</p>
          </div>
        </div>
      )}

      {/* Citations section */}
      {citationTexts.length > 0 && (
        <div className="mt-3 p-3 bg-white rounded-lg border border-border/40">
          <Badge className="text-[10px] mb-2 bg-[#F9FAFB] text-muted-foreground border-0 hover:bg-[#F9FAFB]">
            Citations
          </Badge>
          <div className="px-3 py-2 bg-[#F9FAFB] rounded-md space-y-1">
            {citationTexts.map((text, i) => (
              <p key={i} className="text-xs text-foreground/80">{text}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
