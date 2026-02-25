/**
 * @file Per-client config type definitions
 * @description Types for tag definitions, client configs, and validation
 */

/**
 * Confidence threshold for flagging fields for review.
 * Single source of truth - import this wherever needed.
 */
export const CONFIDENCE_THRESHOLD = 0.85;

/**
 * Validation failure from a tag's validate function.
 *
 * **Scope:** Validation rules are scoped to a SINGLE document only.
 * Cross-document validation belongs in DocGen stage.
 */
export interface ValidationFailure {
  /** Unique rule identifier, snake_case */
  ruleId: string;
  /** Human-readable rule name for UI */
  ruleName: string;
  /** Technical error message (what failed) */
  message: string;
  /** Business rationale (why this rule matters, 80+ chars recommended) */
  description: string;
  /**
   * Field name(s) this failure applies to.
   * - Use `string` for single-field rules (e.g., required, format)
   * - Use `string[]` for multi-field rules (e.g., sum checks, field matching)
   *
   * @example
   * // Single field
   * field: "total_amount"
   *
   * // Multiple fields (sum check)
   * field: ["cash_amount", "insurance_amount", "total_amount"]
   */
  field: string | string[];
}

/**
 * A document tag with classification, extraction, and validation config.
 *
 * The `id` and `classificationHint` are co-located in the same object,
 * ensuring they stay in sync. When building prompts, both come from the
 * same TagDefinition — they can't accidentally diverge.
 *
 * Extraction schemas are managed in ExtendAI dashboard.
 * Validation is a plain function - full flexibility, no DSL.
 */
export interface TagDefinition {
  /** Unique identifier, snake_case. e.g., 'bill_of_lading' */
  id: string;

  /** Human-readable name for UI. e.g., 'Bill of Lading' */
  displayName: string;

  /**
   * Classification hint for Gemini.
   * 2-3 sentences describing what this document looks like.
   * Helps Gemini distinguish between similar document types.
   */
  classificationHint: string;

  /**
   * ExtendAI processor ID for extraction.
   * null = no extraction (classified but not extracted)
   */
  extendProcessorId: string | null;

  /**
   * Validation function for extracted data.
   * Return array of failures. Empty array = valid.
   * Optional - if not provided, no validation runs.
   */
  validate?: (data: Record<string, unknown>) => ValidationFailure[];

  /**
   * Full extraction config from ExtendAI Dashboard.
   * Pulled via 5-onboard-schemas skill into clients/{client}/schemas/{tag}.json.
   * Optional - null for tags without extraction (e.g., "other").
   */
  extractionConfig?: {
    type: "EXTRACT";
    baseProcessor: string;
    baseVersion: string;
    schema: Record<string, unknown>;
    advancedOptions: Record<string, unknown>;
  };
}

/**
 * Per-client configuration for document processing.
 */
export interface ClientConfig {
  /** Unique client identifier, kebab-case. e.g., 'shipping-co' */
  id: string;

  /** Human-readable client name. e.g., 'Shipping Co Pte Ltd' */
  name: string;

  /** Document types this client processes. */
  tags: TagDefinition[];
}
