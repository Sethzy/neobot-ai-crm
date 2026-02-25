/**
 * Document types and Zod schemas for validation.
 * @module types/documents
 */
import { z } from "zod";

/**
 * Document status values.
 */
export const DocumentStatus = {
  UPLOADED: "uploaded",
  PROCESSING: "processing",
  COMPLETE: "complete",
  FAILED: "failed",
} as const;

/**
 * V2 document classification tags.
 * 'other' replaces 'miscellaneous' for unclassifiable content.
 */
export const DocumentTagEnum = z.enum([
  "invoices",
  "reports",
  "contracts",
  "images",
  "correspondence",
  "other",
]);

export type DocumentTag = z.infer<typeof DocumentTagEnum>;

/**
 * V2 Split schema - represents a subdocument within a PDF.
 * Matches GeminiSplitterResponse.splits[] structure.
 */
export const PageRangeSchema = z
  .object({
    /** Chain-of-thought reasoning */
    observation: z.string(),
    /** Starting page number (1-indexed) */
    startPage: z.coerce.number().int().positive(),
    /** Ending page number (1-indexed, inclusive) */
    endPage: z.coerce.number().int().positive(),
    /** Document type classification */
    type: DocumentTagEnum,
    /** Unique reference (invoice number, policy number, etc.) */
    identifier: z.string().nullable(),
    /** Document date in YYYY-MM-DD format (ISO 8601) */
    document_date: z.string().nullable(),
    /** Description of potential duplicate if detected, null if no duplicate */
    potential_duplicate: z.string().nullable(),
  })
  .refine((data) => data.startPage <= data.endPage, {
    message: "startPage must be <= endPage",
    path: ["endPage"],
  });

export type PageRange = z.infer<typeof PageRangeSchema>;

/**
 * Schema for a Document record from the database.
 * Validates the full document object returned from Supabase.
 */
export const DocumentSchema = z.object({
  id: z.string().uuid(),
  case_id: z.string().uuid(),
  created_by: z.string().uuid(),
  original_filename: z.string().min(1),
  filename: z.string().min(1),
  storage_path: z.string().min(1),
  file_type: z.string().min(1),
  file_size: z.number().int().positive(),
  file_hash: z.string().min(1),
  document_date: z.string().nullable().optional(),
  // V2: tags is now Record<string, number> stored as JSONB
  tags: z.record(z.string(), z.number()).nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  // Gemini processing fields
  renamed_filename: z.string().nullable().optional(),
  primary_tag: DocumentTagEnum.nullable().optional(),
  is_heterogeneous: z.boolean().nullable().optional(),
  page_ranges: z.array(PageRangeSchema).nullable().optional(),
  duplicate_status: z.enum(["none", "detected"]).nullable().optional(),
  processing_error: z.string().nullable().optional(),
  gemini_response: z.unknown().nullable().optional(),
  processed_at: z.string().nullable().optional(),
});

/** Full Document type from database */
export type Document = z.infer<typeof DocumentSchema>;

/**
 * Schema for creating a new document.
 * created_by and filename are set automatically.
 */
export const CreateDocumentSchema = z.object({
  case_id: z.string().uuid(),
  original_filename: z.string().min(1, "Filename is required"),
  storage_path: z.string().min(1),
  file_type: z.string().min(1),
  file_size: z.number().int().positive("File size must be positive"),
  file_hash: z.string().min(1),
});

/** Input type for creating a document */
export type CreateDocumentInput = z.infer<typeof CreateDocumentSchema>;

/**
 * Computed document status from documents_with_status view.
 * These are derived from split statuses, not stored directly.
 */
export const ComputedDocumentStatus = {
  PROCESSING: "processing",
  PROCESSED: "processed",
  IN_REVIEW: "in_review",
  REVIEWED: "reviewed",
  FAILED: "failed",
} as const;

export type ComputedDocumentStatusType =
  (typeof ComputedDocumentStatus)[keyof typeof ComputedDocumentStatus];

/**
 * Schema for document with computed status from view.
 * Extends DocumentSchema with is_reviewed, reviewed_at, and computed_status.
 */
export const DocumentWithStatusSchema = DocumentSchema.extend({
  /** Whether document has been reviewed (locked) */
  is_reviewed: z.boolean(),
  /** When document was reviewed */
  reviewed_at: z.string().nullable(),
  /** Computed status from documents_with_status view */
  computed_status: z.enum([
    "processing",
    "processed",
    "in_review",
    "reviewed",
    "failed",
  ]),
});

/** Document with computed status from view */
export type DocumentWithStatus = z.infer<typeof DocumentWithStatusSchema>;
