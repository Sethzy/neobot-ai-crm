/**
 * @file Gemini API Zod schemas for document splitter
 * @description Defines structured output schemas for Gemini document splitter v2.
 * These schemas are converted to JSON Schema for Gemini's structured output feature.
 */
import { z } from "zod";

/**
 * V2 document classification tags.
 * 'other' replaces 'miscellaneous' for unclassifiable content.
 */
export const DocumentTagEnumV2 = z.enum([
  "invoices",
  "reports",
  "contracts",
  "images",
  "correspondence",
  "other",
]);

export type DocumentTagV2 = z.infer<typeof DocumentTagEnumV2>;

/**
 * Default tag IDs for backward compatibility.
 * Used when no client config is provided.
 */
export const DEFAULT_TAG_IDS = [
  "invoices",
  "reports",
  "contracts",
  "images",
  "correspondence",
  "other",
] as const;

/**
 * Factory function to create a splitter response schema with custom tag IDs.
 * Used to generate client-specific JSON Schemas for Gemini's structured output.
 *
 * @param tagIds - Array of valid tag IDs from client config (e.g., ["medical_expense", "other"])
 * @returns Zod schema for GeminiSplitterResponse with dynamic type enum
 */
export function createSplitterSchema(tagIds: string[]) {
  // Zod requires at least one value for enum
  if (tagIds.length === 0) {
    throw new Error("tagIds must have at least one element");
  }

  // Create dynamic enum from tag IDs
  const tagEnum = z.enum(tagIds as [string, ...string[]]);

  // Create split schema with dynamic type
  const dynamicSplitSchema = z
    .object({
      observation: z.string().min(1),
      startPage: z.coerce.number().int().positive(),
      endPage: z.coerce.number().int().positive(),
      type: tagEnum,
      identifier: z.string().nullable(),
      document_date: z.string().nullable(),
      potential_duplicate: z.string().nullable(),
    })
    .refine((data) => data.startPage <= data.endPage, {
      message: "startPage must be <= endPage",
      path: ["endPage"],
    });

  // Create response schema with dynamic split
  return z.object({
    schema_version: z.literal("splitter_v2"),
    summary: z.string(),
    suggested_filename: z.string(),
    splits: z.array(dynamicSplitSchema).min(1, "At least one split required"),
  });
}

/**
 * Schema for a single document split.
 * Chain-of-thought: observation MUST be populated first for accuracy.
 */
export const SplitSchema = z
  .object({
    /** CoT reasoning - MUST be populated first */
    observation: z.string().min(1),
    /** First page of this subdocument (1-indexed) */
    startPage: z.coerce.number().int().positive(),
    /** Last page of this subdocument (1-indexed, inclusive) */
    endPage: z.coerce.number().int().positive(),
    /** Classification from DocumentTagEnumV2 */
    type: DocumentTagEnumV2,
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

export type Split = z.infer<typeof SplitSchema>;

/**
 * Dynamic split type for per-client tag IDs.
 * Same as Split but with `type: string` instead of static enum.
 */
export interface DynamicSplit {
  observation: string;
  startPage: number;
  endPage: number;
  type: string;
  identifier: string | null;
  document_date: string | null;
  potential_duplicate: string | null;
}

/**
 * Dynamic splitter response for per-client configs.
 * Used when tag IDs come from client config instead of static enum.
 */
export interface DynamicSplitterResponse {
  schema_version: "splitter_v2";
  summary: string;
  suggested_filename: string;
  splits: DynamicSplit[];
}

/**
 * Complete Gemini splitter v2 response schema.
 * Splits PDF into logical subdocuments with per-split metadata.
 */
export const GeminiSplitterResponse = z.object({
  /** Version marker for schema evolution */
  schema_version: z.literal("splitter_v2"),
  /** Brief description of the entire document bundle */
  summary: z.string(),
  /** LLM-generated human-readable filename for the file */
  suggested_filename: z.string(),
  /** Array of subdocument splits - must have at least one */
  splits: z.array(SplitSchema).min(1, "At least one split required"),
});

export type GeminiSplitterResponseType = z.infer<typeof GeminiSplitterResponse>;

// ===== V2 DERIVATION FUNCTIONS =====

/**
 * Derives the primary tag (most frequent type) from splits.
 * Accepts both static Split[] and DynamicSplit[].
 */
export function derivePrimaryTag(splits: DynamicSplit[]): string {
  const counts: Record<string, number> = {};

  for (const split of splits) {
    counts[split.type] = (counts[split.type] || 0) + 1;
  }

  let maxCount = 0;
  let primaryTag: string = splits[0].type;

  for (const [tag, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      primaryTag = tag;
    }
  }

  return primaryTag;
}

/**
 * Derives tag counts from splits (stored as JSONB in tags column).
 * Accepts both static Split[] and DynamicSplit[].
 */
export function deriveTags(splits: DynamicSplit[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const split of splits) {
    counts[split.type] = (counts[split.type] || 0) + 1;
  }

  return counts;
}

/**
 * Derives duplicate status from split potential_duplicate fields.
 * Binary: 'none' if no duplicates detected, 'detected' if any found.
 */
export function deriveDuplicateStatus(splits: DynamicSplit[]): "none" | "detected" {
  const hasDuplicates = splits.some((s) => s.potential_duplicate !== null);
  return hasDuplicates ? "detected" : "none";
}

/**
 * Derives whether document is heterogeneous (contains multiple types).
 */
export function deriveIsHeterogeneous(splits: DynamicSplit[]): boolean {
  const uniqueTypes = new Set(splits.map((s) => s.type));
  return uniqueTypes.size > 1;
}

/**
 * Derives top-level document date from first split (for sorting/filtering).
 * Gemini returns ISO format (YYYY-MM-DD) which is passed through directly to PostgreSQL.
 */
export function deriveDocumentDate(splits: DynamicSplit[]): string | null {
  return splits[0]?.document_date ?? null;
}

/**
 * Sanitizes LLM-generated filename by removing filesystem-unsafe characters.
 * Replaces / \ : * ? " < > | with dashes, collapses whitespace, trims.
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Maps a Gemini splitter v2 response to document table update fields.
 * All top-level fields are derived from splits.
 * Accepts DynamicSplitterResponse for per-client tag IDs.
 */
export function mapSplitterResponseToDocument(
  response: DynamicSplitterResponse,
  fileExtension: string
): {
  renamed_filename: string;
  primary_tag: string;
  tags: Record<string, number>;
  description: string;
  is_heterogeneous: boolean;
  page_ranges: DynamicSplit[];
  duplicate_status: "none" | "detected";
  document_date: string | null;
  status: "complete";
  processed_at: string;
  gemini_response: DynamicSplitterResponse;
} {
  return {
    renamed_filename: `${sanitizeFilename(response.suggested_filename)}.${fileExtension}`,
    primary_tag: derivePrimaryTag(response.splits),
    tags: deriveTags(response.splits),
    description: response.summary,
    is_heterogeneous: deriveIsHeterogeneous(response.splits),
    page_ranges: response.splits,
    duplicate_status: deriveDuplicateStatus(response.splits),
    document_date: deriveDocumentDate(response.splits),
    status: "complete",
    processed_at: new Date().toISOString(),
    gemini_response: response,
  };
}

