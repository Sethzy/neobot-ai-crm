/**
 * @file ExtendAI raw fetch client
 * @description Direct fetch to ExtendAI API for document extraction.
 * Reuses retry utilities from gemini.ts for consistency.
 */

import { sleep, shouldRetry, calculateBackoff } from "./gemini";

const MAX_RETRIES = 3;
const EXTEND_API_URL = "https://api.extend.ai/processor_runs";
const EXTEND_UPLOAD_URL = "https://api.extend.ai/files/upload";
const EXTEND_API_VERSION = "2025-04-21";

// ============================================================================
// Types
// ============================================================================

/**
 * Extraction config pulled from ExtendAI Dashboard.
 * Matches structure in clients/{client}/schemas/{tag}.json → config
 */
export interface ExtractionConfig {
  type: "EXTRACT";
  baseProcessor: string;
  baseVersion: string;
  schema: Record<string, unknown>;
  advancedOptions: Record<string, unknown>;
}

export interface ExtendExtractionRequest {
  processorId: string;
  /** URL to PDF file (use this OR fileId) */
  fileUrl?: string;
  /** ExtendAI file ID from upload (use this OR fileUrl) */
  fileId?: string;
  /** Page range - DEPRECATED: Use child PDF with fileId instead */
  pageRange?: { start: number; end: number };
  /** Full extraction config from TagDefinition.extractionConfig */
  config: ExtractionConfig;
}

/**
 * Response from ExtendAI file upload.
 */
export interface ExtendUploadResult {
  success: boolean;
  file: {
    id: string;
    name: string;
    presignedUrl: string;
  };
}

export interface ExtendExtractionResult {
  success: boolean;
  runId: string;
  status: "PROCESSED" | "PROCESSING" | "FAILED";
  value: Record<string, unknown>;
  metadata: Record<string, ExtendMetadataEntry>;
  failureReason?: string | null;
  failureMessage?: string | null;
  /** Link to ExtendAI dashboard for this run. */
  dashboardUrl?: string;
}

export interface ExtendMetadataEntry {
  /** OCR confidence (0-1). Primary confidence metric for JSON Schema processors. */
  ocrConfidence: number | null;
  /** LLM confidence. Always null for JSON Schema processors. */
  logprobsConfidence: number | null;
  /** Source citations with bounding boxes. */
  citations?: ExtendCitation[];
  /** AI reasoning insights. Returned when modelReasoningInsightsEnabled: true. */
  insights?: Array<{ type: string; content: string }>;
  /** Field description from schema. Enriched from run.config.schema.properties. */
  description?: string;
}

export interface ExtendCitation {
  page?: number;
  referenceText?: string | null;
  polygon?: Array<{ x: number; y: number }>;
}

// ============================================================================
// Upload Helpers
// ============================================================================

/**
 * Creates FormData for uploading PDF bytes to ExtendAI.
 * Exported for testing.
 *
 * @param pdfBytes - PDF file as Uint8Array
 * @param filename - Optional filename (default: "document.pdf")
 * @returns FormData ready for upload
 */
export function createUploadFormData(
  pdfBytes: Uint8Array,
  filename = "document.pdf"
): FormData {
  const blob = new Blob([pdfBytes as BlobPart], { type: "application/pdf" });
  const formData = new FormData();
  formData.append("file", blob, filename);
  return formData;
}

/**
 * Uploads PDF bytes to ExtendAI and returns the file ID.
 * Use this before calling runExtraction with child PDFs.
 *
 * @param pdfBytes - PDF file as Uint8Array
 * @param apiKey - ExtendAI API key
 * @param filename - Optional filename for the upload
 * @returns ExtendAI file ID (e.g., "file_abc123")
 * @throws Error if upload fails
 *
 * @example
 * const fileId = await uploadToExtendAI(childPdfBytes, apiKey, "split-1.pdf");
 * const result = await runExtraction({ processorId, fileId, config }, apiKey);
 */
export async function uploadToExtendAI(
  pdfBytes: Uint8Array,
  apiKey: string,
  filename = "document.pdf"
): Promise<string> {
  const formData = createUploadFormData(pdfBytes, filename);

  let lastError: Error = new Error("Upload failed");

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(EXTEND_UPLOAD_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "x-extend-api-version": EXTEND_API_VERSION,
          // Note: Do NOT set Content-Type for FormData - browser sets it with boundary
        },
        body: formData,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[ExtendAI] Upload failed: ${response.status}`, errorBody);
        lastError = new Error(`ExtendAI upload failed: ${response.status}`);

        // Don't retry 4xx errors (client errors)
        if (response.status >= 400 && response.status < 500) {
          throw lastError;
        }
      } else {
        const data: ExtendUploadResult = await response.json();

        if (!data.success || !data.file?.id) {
          throw new Error("ExtendAI upload returned invalid response");
        }

        return data.file.id;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES) {
        console.error(`[ExtendAI] Upload attempt ${attempt} failed:`, lastError.message);
      }
    }

    // Retry with backoff for transient errors
    if (attempt < MAX_RETRIES) {
      const backoff = calculateBackoff(attempt);
      await sleep(backoff);
    }
  }

  throw lastError;
}

// ============================================================================
// Payload Builder
// ============================================================================

/**
 * Builds the ExtendAI API payload from extraction request.
 * Exported for testing.
 *
 * @param request - Extraction request with fileUrl OR fileId
 * @returns API payload object
 * @throws Error if neither fileUrl nor fileId provided
 */
export function buildExtractionPayload(request: ExtendExtractionRequest) {
  // Determine file source - prefer fileId over fileUrl
  let file: { fileUrl?: string; fileId?: string };
  if (request.fileId) {
    file = { fileId: request.fileId };
  } else if (request.fileUrl) {
    file = { fileUrl: request.fileUrl };
  } else {
    throw new Error("fileUrl or fileId required");
  }

  // Build advancedOptions - only add pageRanges if using fileUrl with pageRange (legacy)
  const mergedAdvancedOptions = { ...request.config.advancedOptions };
  if (request.pageRange && request.fileUrl && !request.fileId) {
    // Legacy mode: using fileUrl with pageRange (ExtendAI ignores this but keep for backwards compat)
    (mergedAdvancedOptions as Record<string, unknown>).pageRanges = [request.pageRange];
  }

  return {
    processorId: request.processorId,
    file,
    sync: true,
    config: {
      type: request.config.type,
      baseProcessor: request.config.baseProcessor,
      baseVersion: request.config.baseVersion,
      schema: request.config.schema,
      advancedOptions: mergedAdvancedOptions,
    },
  };
}

// ============================================================================
// Core API
// ============================================================================

/**
 * Calls ExtendAI processor_runs endpoint via raw fetch.
 * Includes retry logic with exponential backoff (1s, 2s, 4s).
 *
 * @param request - Extraction request with processorId, fileUrl, pageRange, config
 * @param apiKey - ExtendAI API key
 * @returns Extraction result with value, metadata, and status
 * @throws Error with descriptive message for API failures
 */
export async function runExtraction(
  request: ExtendExtractionRequest,
  apiKey: string
): Promise<ExtendExtractionResult> {
  // Build payload using helper (supports both fileUrl and fileId)
  const payload = buildExtractionPayload(request);

  let lastError: Error = new Error("Unknown error");

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(EXTEND_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "x-extend-api-version": EXTEND_API_VERSION,
        },
        body: JSON.stringify(payload),
      });

      // Handle HTTP errors
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[ExtendAI] HTTP ${response.status}:`, errorBody);

        if (response.status === 400) {
          throw new Error(`Invalid extraction request: ${errorBody}`);
        }
        if (response.status === 401) {
          throw new Error("ExtendAI authentication failed");
        }
        if (response.status === 429) {
          throw new Error("ExtendAI rate limit exceeded");
        }
        throw new Error(`ExtendAI API error: ${response.status}`);
      }

      const data = await response.json();
      const run = data.processorRun;

      // Enrich metadata with descriptions from config.schema.properties
      const schemaProps = run.config?.schema?.properties ?? {};
      const rawMetadata = run.output?.metadata ?? {};
      const enrichedMetadata: Record<string, ExtendMetadataEntry> = {};

      for (const [field, meta] of Object.entries(rawMetadata)) {
        const fieldMeta = meta as ExtendMetadataEntry;
        const description = schemaProps[field]?.description;
        enrichedMetadata[field] = description
          ? { ...fieldMeta, description }
          : fieldMeta;
      }

      return {
        success: data.success && run.status === "PROCESSED",
        runId: run.id,
        status: run.status,
        value: run.output?.value ?? {},
        metadata: enrichedMetadata,
        failureReason: run.failureReason,
        failureMessage: run.failureMessage,
        dashboardUrl: run.url,
      };

    } catch (error) {
      lastError = error as Error;
      if (attempt < MAX_RETRIES) {
        console.error(`[ExtendAI] Attempt ${attempt} failed:`, lastError.message);
      }

      if (!shouldRetry(error)) {
        throw error;
      }

      if (attempt < MAX_RETRIES) {
        const backoff = calculateBackoff(attempt);
        await sleep(backoff);
      }
    }
  }

  throw lastError;
}
