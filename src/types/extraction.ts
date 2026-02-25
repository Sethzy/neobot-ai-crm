/**
 * @file Extraction types for split data
 * @description Types for extraction results, citations, and field metadata
 */
import { z } from "zod";

/**
 * Point in a bounding box polygon.
 */
export const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export type Point = z.infer<typeof PointSchema>;

/**
 * Citation from ExtendAI with source location.
 */
export const CitationSchema = z.object({
  /** Page number (1-indexed from ExtendAI) */
  page: z.number().optional(),
  /** Source text that was extracted */
  referenceText: z.string().nullable().optional(),
  /** Bounding box polygon for highlighting */
  polygon: z.array(PointSchema).optional(),
});

export type Citation = z.infer<typeof CitationSchema>;

/**
 * AI insight from ExtendAI extraction.
 */
export const InsightSchema = z.object({
  /** Insight type (e.g., "reasoning") */
  type: z.string(),
  /** Insight content text */
  content: z.string(),
});

export type Insight = z.infer<typeof InsightSchema>;

/**
 * Per-field metadata from ExtendAI extraction.
 */
export const FieldMetadataSchema = z.object({
  /** OCR confidence (0-1). null for digital/typed docs. */
  ocrConfidence: z.number().nullable().optional(),
  /** Source citations with bounding boxes */
  citations: z.array(CitationSchema).optional(),
  /** AI insights (reasoning, observations) */
  insights: z.array(InsightSchema).optional(),
});

export type FieldMetadata = z.infer<typeof FieldMetadataSchema>;

/**
 * Low confidence field for UI display.
 */
export const LowConfidenceFieldSchema = z.object({
  field: z.string(),
  ocrConfidence: z.number(),
});

/**
 * Validation failure for UI display.
 */
export const ValidationFailureSchema = z.object({
  ruleId: z.string(),
  ruleName: z.string(),
  message: z.string(),
  description: z.string(),
  field: z.union([z.string(), z.array(z.string())]),
});

/**
 * Extraction status values for splits.
 */
export const ExtractionStatus = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETE: "complete",
  NEEDS_REVIEW: "needs_review",
  FAILED: "failed",
} as const;

export type ExtractionStatusType = (typeof ExtractionStatus)[keyof typeof ExtractionStatus];

/**
 * Split extraction data from database.
 * Matches splits table schema.
 */
export const SplitExtractionSchema = z.object({
  /** Split UUID */
  id: z.string().uuid(),
  /** Parent document UUID */
  documentId: z.string().uuid(),
  /** 0-indexed position within document */
  splitIndex: z.number().int().nonnegative(),
  /** First page (1-indexed) */
  startPage: z.number().int().positive(),
  /** Last page (1-indexed) */
  endPage: z.number().int().positive(),
  /** Document type classification */
  tagId: z.string(),
  /** Document reference number */
  identifier: z.string().nullable(),
  /** Document date (YYYY-MM-DD) */
  documentDate: z.string().nullable(),
  /** Potential duplicate description if detected */
  potentialDuplicate: z.string().nullable(),
  /** Gemini's reasoning */
  observation: z.string().nullable(),
  /** ExtendAI processor used */
  extendProcessorId: z.string().nullable(),
  /** Editable extracted values */
  extractedData: z.record(z.string(), z.unknown()).nullable(),
  /** Original immutable extraction (for audit) */
  originalExtractedData: z.record(z.string(), z.unknown()).nullable(),
  /** Per-field metadata (confidence, citations) */
  extractionMetadata: z.record(z.string(), FieldMetadataSchema).nullable(),
  /** Current extraction status */
  extractionStatus: z.enum(["pending", "processing", "complete", "needs_review", "failed"]),
  /** Error message if failed */
  extractionError: z.string().nullable(),
  /** Business rule validation failures */
  validationFailures: z.array(ValidationFailureSchema).nullable(),
  /** Fields with low OCR confidence */
  lowConfidenceFields: z.array(LowConfidenceFieldSchema).nullable(),
  /** PDF page width in points for highlight positioning */
  pageWidth: z.number().nullable(),
  /** PDF page height in points for highlight positioning */
  pageHeight: z.number().nullable(),
  /** Rule IDs dismissed by user for this split */
  dismissedRuleIds: z.array(z.string()).nullable(),
  /** Created timestamp */
  createdAt: z.string(),
  /** Updated timestamp */
  updatedAt: z.string(),
});

export type SplitExtraction = z.infer<typeof SplitExtractionSchema>;

/**
 * Confidence threshold for flagging fields for review.
 * Re-exported from config/types for convenience.
 */
export const CONFIDENCE_THRESHOLD = 0.85;

/**
 * Check if a confidence score is below threshold.
 * Returns false for null/undefined (digital docs don't need review).
 */
export function isLowConfidence(
  ocrConfidence: number | null | undefined,
  threshold = CONFIDENCE_THRESHOLD
): boolean {
  if (ocrConfidence == null) return false;
  return ocrConfidence < threshold;
}

/**
 * Check if a split needs human review.
 * True if: status is needs_review, has low confidence fields, or has validation failures.
 */
export function splitNeedsReview(split: SplitExtraction): boolean {
  if (split.extractionStatus === "needs_review") return true;
  if (split.lowConfidenceFields && split.lowConfidenceFields.length > 0) return true;
  if (split.validationFailures && split.validationFailures.length > 0) return true;
  return false;
}
