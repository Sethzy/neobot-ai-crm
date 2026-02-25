/**
 * @file Extraction validator
 * @description Validates ExtendAI output against tag rules and confidence threshold
 */

import { CONFIDENCE_THRESHOLD, type ValidationFailure, type TagDefinition } from "./types";

/**
 * Field flagged for low OCR confidence.
 */
export interface LowConfidenceField {
  /** Field path (e.g., "patient_name" or "line_items[0].amount") */
  field: string;
  /** OCR confidence score (0-1) */
  ocrConfidence: number;
}

/**
 * Result of validation check.
 */
export interface ValidationResult {
  /** True if no failures and no low confidence fields */
  valid: boolean;
  /** Business rule validation failures */
  failures: ValidationFailure[];
  /** Fields with OCR confidence below threshold */
  lowConfidenceFields: LowConfidenceField[];
}

/**
 * ExtendAI extraction output structure.
 */
export interface ExtendAIOutput {
  /** Extracted field values */
  value: Record<string, unknown>;
  /** Per-field metadata with confidence scores */
  metadata: Record<string, { ocrConfidence?: number | null }>;
}

/**
 * Validates extraction output against tag's validate function
 * and confidence threshold.
 *
 * @param output - ExtendAI extraction output
 * @param tag - Tag definition with optional validate function
 * @returns Validation result with failures and low confidence fields
 */
export function validateExtraction(
  output: ExtendAIOutput,
  tag: TagDefinition
): ValidationResult {
  // 1. Run tag's validate function (if defined)
  const failures = tag.validate?.(output.value) ?? [];

  // 2. Check per-field confidence
  const lowConfidenceFields: LowConfidenceField[] = [];
  for (const [field, meta] of Object.entries(output.metadata)) {
    if (
      meta?.ocrConfidence != null &&
      meta.ocrConfidence < CONFIDENCE_THRESHOLD
    ) {
      lowConfidenceFields.push({ field, ocrConfidence: meta.ocrConfidence });
    }
  }

  return {
    valid: failures.length === 0 && lowConfidenceFields.length === 0,
    failures,
    lowConfidenceFields,
  };
}
