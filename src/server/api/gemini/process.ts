/**
 * @file Gemini document processing API endpoint
 * @description Vercel serverless function that processes documents with Gemini API.
 * Triggered after document upload, updates document with classification results.
 *
 * POST /api/gemini/process
 * Body: { documentId: string }
 * Headers: Authorization: Bearer <supabase_jwt>
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI, createPartFromUri } from "@google/genai";
import { z } from "zod";
import type { Database, Json } from "../../../types/database";
import {
  mapSplitterResponseToDocument,
  createSplitterSchema,
  type DynamicSplitterResponse,
} from "../../../types/gemini";
import {
  sleep,
  shouldRetry,
  calculateBackoff,
  getProcessingErrorMessage,
} from "../../../lib/gemini";
import imageSize from "image-size";
import {
  getClientConfig,
  buildSplitterPrompt,
  validateExtraction,
  type TagDefinition,
} from "../../../config/index";
import { runExtraction, uploadToExtendAI } from "../../../lib/extend-ai";
import { splitPdf, getPdfPageCount, shouldSkipSplit, getPdfDimensions } from "../../../lib/pdf-splitter";
import { offsetCitationPages } from "../../../lib/highlight-utils";
import {
  validateRequest,
  extractToken,
  createSuccessResponse,
  createErrorResponse,
} from "../../../api/gemini-process";
import {
  prepareFileForGemini,
  deleteGoogleFile,
} from "../../../lib/gemini-files";
import {
  sendWhatsAppResult,
  formatProcessingResult,
} from "../../../lib/whatsapp/send-result";

const MAX_RETRIES = 3;
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Downloads PDF bytes from a signed URL.
 */
async function downloadPdfBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/**
 * Creates a split row in the database.
 * Returns the created split ID or throws on error.
 */
async function createSplitRow(
  supabase: ReturnType<typeof createClient<Database>>,
  data: {
    documentId: string;
    splitIndex: number;
    startPage: number;
    endPage: number;
    tagId: string;
    identifier: string | null;
    documentDate: string | null;
    potentialDuplicate: string | null;
    observation: string;
    extendProcessorId: string | null;
    extractionEnabled: boolean;
  }
): Promise<string> {
  const shouldExtract = data.extendProcessorId && data.extractionEnabled;

  const { data: split, error } = await supabase
    .from("splits")
    .insert({
      document_id: data.documentId,
      split_index: data.splitIndex,
      start_page: data.startPage,
      end_page: data.endPage,
      tag_id: data.tagId,
      identifier: data.identifier,
      document_date: data.documentDate,
      potential_duplicate: data.potentialDuplicate,
      observation: data.observation,
      extend_processor_id: shouldExtract ? data.extendProcessorId : null,
      extraction_status: shouldExtract ? "pending" : "complete",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create split: ${error.message}`);
  }

  return split.id;
}

/**
 * Processes ExtendAI extraction for a single split.
 * Updates split row with results or error.
 *
 * @param supabase - Supabase client
 * @param splitId - Split row ID
 * @param tag - Tag definition with processor config
 * @param fileIdOrUrl - ExtendAI file ID (from upload) OR fileUrl for skip case
 * @param useFileId - True if fileIdOrUrl is an ExtendAI ID, false if it's a URL
 * @param startPage - Start page in original PDF (for citation offset)
 */
async function processExtractionForSplit(
  supabase: ReturnType<typeof createClient<Database>>,
  splitId: string,
  tag: TagDefinition,
  fileIdOrUrl: string,
  useFileId: boolean,
  startPage: number
): Promise<void> {
  // Skip if no processor configured
  if (!tag.extendProcessorId) {
    return;
  }

  // Update status to processing
  await supabase
    .from("splits")
    .update({ extraction_status: "processing" })
    .eq("id", splitId);

  try {
    // Ensure tag has extraction config
    if (!tag.extractionConfig) {
      throw new Error(`Tag ${tag.id} missing extractionConfig`);
    }

    // Call ExtendAI with fileId or fileUrl
    console.log(
      `[Gemini API] Extracting split ${splitId} with processor ${tag.extendProcessorId}`
    );
    const result = await runExtraction(
      {
        processorId: tag.extendProcessorId!,
        ...(useFileId ? { fileId: fileIdOrUrl } : { fileUrl: fileIdOrUrl }),
        config: tag.extractionConfig,
      },
      process.env.EXTEND_API_KEY!
    );

    // Offset citation page numbers if this was a child PDF (startPage > 1)
    const offsetMetadata: Record<string, unknown> = {};
    for (const [field, meta] of Object.entries(result.metadata)) {
      if (meta.citations && startPage > 1) {
        offsetMetadata[field] = {
          ...meta,
          citations: offsetCitationPages(meta.citations, startPage),
        };
      } else {
        offsetMetadata[field] = meta;
      }
    }

    // Validate extraction
    const validation = validateExtraction(
      { value: result.value, metadata: result.metadata },
      tag
    );

    // Determine status based on validation
    const status = validation.valid ? "complete" : "needs_review";

    // Update split with results (using offset metadata)
    await supabase
      .from("splits")
      .update({
        original_extracted_data: result.value as Json,
        extracted_data: result.value as Json,
        extraction_metadata: offsetMetadata as unknown as Json,
        extraction_status: status,
        schema_version: null,
        validation_failures:
          validation.failures.length > 0
            ? (validation.failures as unknown as Json)
            : null,
        low_confidence_fields:
          validation.lowConfidenceFields.length > 0
            ? (validation.lowConfidenceFields as unknown as Json)
            : null,
        extend_dashboard_url: result.dashboardUrl ?? null,
      })
      .eq("id", splitId);

    console.log(`[Gemini API] Split ${splitId} extraction ${status}`);
  } catch (error) {
    // Mark split as failed
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[Gemini API] Split ${splitId} extraction failed:`,
      errorMessage
    );

    await supabase
      .from("splits")
      .update({
        extraction_status: "failed",
        extraction_error: errorMessage,
      })
      .eq("id", splitId);
  }
}

/**
 * Maps file extension to MIME type for Gemini API.
 */
function getMimeType(fileType: string): string {
  const mimeTypes: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    tiff: "image/tiff",
    tif: "image/tiff",
    heic: "image/heic",
    webp: "image/webp",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    csv: "text/csv",
    txt: "text/plain",
    eml: "message/rfc822",
  };

  return mimeTypes[fileType.toLowerCase()] || "application/octet-stream";
}

/**
 * Main handler for POST /api/gemini/process
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  console.log("[Gemini API] === REQUEST START ===");
  console.log("[Gemini API] ENV CHECK:");
  console.log("  SUPABASE_URL:", SUPABASE_URL ? "SET" : "MISSING");
  console.log("  SUPABASE_ANON_KEY:", SUPABASE_ANON_KEY ? "SET" : "MISSING");
  console.log("  GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "SET" : "MISSING");
  console.log("  EXTEND_API_KEY:", process.env.EXTEND_API_KEY ? "SET" : "MISSING");

  // Check if extraction is enabled (API key configured)
  const extractionEnabled = !!process.env.EXTEND_API_KEY;
  if (!extractionEnabled) {
    console.log("[Gemini API] EXTEND_API_KEY not configured - extraction disabled");
  }

  try {
    // Only allow POST
    if (req.method !== "POST") {
      return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    // Validate request body
    console.log("[Gemini API] Body:", JSON.stringify(req.body));
    const validation = validateRequest(req.body);
    if (!validation.success) {
      return res.status(400).json({ success: false, error: "Invalid documentId" });
    }
    const { documentId } = validation.data;
    console.log("[Gemini API] Document ID:", documentId);

    // Authenticate: internal secret (MCP / WhatsApp relay) OR JWT (browser)
    const internalSecret = req.headers["x-internal-secret"] as string | undefined;
    const isInternalCall = !!internalSecret && internalSecret === process.env.SUNDER_INTERNAL_SECRET;

    let supabase: ReturnType<typeof createClient<Database>>;

    if (isInternalCall) {
      console.log("[Gemini API] Internal call authenticated via X-Internal-Secret");
      if (!SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(500).json({ success: false, error: "Supabase environment is not configured" });
      }
      supabase = createClient<Database>(
        SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
    } else {
      const token = extractToken(req.headers.authorization as string | undefined);
      if (!token) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        return res.status(500).json({ success: false, error: "Supabase environment is not configured" });
      }
      console.log("[Gemini API] Token extracted successfully");
      supabase = createClient<Database>(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        {
          global: {
            headers: { Authorization: `Bearer ${token}` },
          },
        }
      );
    }
    console.log("[Gemini API] Supabase client created");

    // Fetch document (RLS enforces ownership for JWT calls; service role bypasses)
    console.log("[Gemini API] Fetching document...");
    const { data: document, error: fetchError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (fetchError || !document) {
      return res.status(404).json({ success: false, error: "Document not found" });
    }
    console.log("[Gemini API] Document fetched:", document.original_filename);
    console.log("[Gemini API] File size:", document.file_size, "bytes");

    // Resolve client_config_id
    let clientConfigId: string | null = null;

    if (isInternalCall) {
      // Internal calls: derive user from document.created_by, query user_profiles directly
      console.log("[Gemini API] Fetching client config for user:", document.created_by);
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("client_config_id")
        .eq("id", document.created_by)
        .single();
      clientConfigId = profile?.client_config_id ?? null;
    } else {
      // JWT calls: verify user and use RPC
      console.log("[Gemini API] Fetching user profile...");
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rpcResult } = await (supabase.rpc as any)("get_my_client_config");
      clientConfigId = rpcResult;
    }
    console.log("[Gemini API] Client config:", clientConfigId ?? "default");

    // Get client configuration and build dynamic prompt
    const clientConfig = getClientConfig(clientConfigId);
    const dynamicPrompt = buildSplitterPrompt(clientConfig);
    console.log(
      "[Gemini API] Using config:",
      clientConfig.id,
      "with",
      clientConfig.tags.length,
      "tags"
    );

    // Update status to processing
    console.log("[Gemini API] Updating status to processing...");
    await supabase
      .from("documents")
      .update({ status: "processing" })
      .eq("id", documentId);

    // Generate signed URL (300s expiry for large files)
    console.log("[Gemini API] Generating signed URL...");
    const { data: signedUrlData, error: signedUrlError } = await supabase
      .storage
      .from("documents")
      .createSignedUrl(document.storage_path, 300);

    if (signedUrlError || !signedUrlData) {
      throw new Error("Failed to generate signed URL");
    }
    console.log("[Gemini API] Signed URL generated");

    // Get MIME type from file extension
    const mimeType = getMimeType(document.file_type);
    console.log("[Gemini API] MIME type:", mimeType);

    // Upload file to Google Files API
    console.log("[Gemini API] Preparing file for Gemini (download → upload → wait)...");
    const uploadStart = Date.now();
    const googleFile = await prepareFileForGemini({
      sourceUrl: signedUrlData.signedUrl,
      mimeType,
      displayName: document.original_filename,
      apiKey: process.env.GEMINI_API_KEY!,
    });
    console.log(
      "[Gemini API] File ready:",
      googleFile.uri,
      `(${Date.now() - uploadStart}ms)`
    );

    console.log("[Gemini API] Calling Gemini API...");

    try {
      // Call Gemini with dynamic prompt and tag IDs from client config
      const tagIds = clientConfig.tags.map((t) => t.id);
      const geminiResult = await callGeminiWithRetry(
        googleFile.uri,
        mimeType,
        dynamicPrompt,
        tagIds
      );

      // Map response to document fields (v2)
      const updateFields = mapSplitterResponseToDocument(
        geminiResult,
        document.file_type
      );

      // Create split rows from Gemini response
      console.log("[Gemini API] Creating split rows...");
      const splitIds: string[] = [];

      for (let i = 0; i < geminiResult.splits.length; i++) {
        const split = geminiResult.splits[i];

        // Look up tag from config
        const tag =
          clientConfig.tags.find((t) => t.id === split.type) ??
          clientConfig.tags.find((t) => t.id === "other") ??
          clientConfig.tags[clientConfig.tags.length - 1]; // Fallback to last tag

        const splitId = await createSplitRow(supabase, {
          documentId,
          splitIndex: i,
          startPage: split.startPage,
          endPage: split.endPage,
          tagId: tag.id,
          identifier: split.identifier ?? null,
          documentDate: split.document_date ?? null,
          potentialDuplicate: split.potential_duplicate ?? null,
          observation: split.observation,
          extendProcessorId: tag.extendProcessorId,
          extractionEnabled,
        });

        splitIds.push(splitId);
        console.log(
          `[Gemini API] Created split ${i}: ${tag.id} (pages ${split.startPage}-${split.endPage})`
        );
      }

      console.log("[Gemini API] Created", splitIds.length, "splits");

      // Process extractions for splits that have processors configured
      if (extractionEnabled) {
        console.log("[Gemini API] Processing extractions...");
        console.log(`[Gemini API] File type: ${document.file_type}`);

        const isPdf = document.file_type.toLowerCase() === "pdf";
        const extractionPromises: Promise<void>[] = [];

        if (isPdf) {
          // ===== PDF PATH: Download, split if needed, upload child PDFs =====
          console.log("[Gemini API] PDF detected - using PDF splitting logic");

          // Download PDF bytes once for splitting
          console.log("[Gemini API] Downloading PDF for splitting...");
          const pdfBytes = await downloadPdfBytes(signedUrlData.signedUrl);
          const totalPages = await getPdfPageCount(pdfBytes);
          console.log(`[Gemini API] PDF has ${totalPages} pages`);

          // Build split ranges from Gemini response
          const splitRanges = geminiResult.splits.map((s) => ({
            startPage: s.startPage,
            endPage: s.endPage,
          }));

          // Check if we can skip splitting (single split = whole PDF)
          const skipSplit = shouldSkipSplit(splitRanges, totalPages);
          if (skipSplit) {
            console.log("[Gemini API] Single split = whole PDF, using original URL");
          }

          // For skip-split case, get dimensions from original PDF once
          let skipSplitDimensions: { pageWidth: number; pageHeight: number } | null = null;
          if (skipSplit) {
            skipSplitDimensions = await getPdfDimensions(pdfBytes, 1);
            console.log("[Gemini API] Skip-split dimensions:", skipSplitDimensions);
          }

          for (let i = 0; i < geminiResult.splits.length; i++) {
            const split = geminiResult.splits[i];
            const splitId = splitIds[i];

            // Look up tag again
            const tag =
              clientConfig.tags.find((t) => t.id === split.type) ??
              clientConfig.tags.find((t) => t.id === "other") ??
              clientConfig.tags[clientConfig.tags.length - 1];

            let pageWidth: number;
            let pageHeight: number;

            if (tag.extendProcessorId) {
              let fileIdOrUrl: string;
              let useFileId: boolean;

              if (skipSplit) {
                // Use original signed URL directly (no upload needed)
                fileIdOrUrl = signedUrlData.signedUrl;
                useFileId = false;
                pageWidth = skipSplitDimensions!.pageWidth;
                pageHeight = skipSplitDimensions!.pageHeight;
              } else {
                // Create child PDF for this split
                console.log(
                  `[Gemini API] Splitting pages ${split.startPage}-${split.endPage}...`
                );
                const splitResult = await splitPdf(pdfBytes, {
                  startPage: split.startPage,
                  endPage: split.endPage,
                });
                pageWidth = splitResult.pageWidth;
                pageHeight = splitResult.pageHeight;
                console.log(
                  `[Gemini API] Child PDF created: ${splitResult.bytes.length} bytes (${pageWidth}x${pageHeight})`
                );

                // Upload child PDF to ExtendAI
                const filename = `split-${i + 1}-pages-${split.startPage}-${split.endPage}.pdf`;
                fileIdOrUrl = await uploadToExtendAI(
                  splitResult.bytes,
                  process.env.EXTEND_API_KEY!,
                  filename
                );
                useFileId = true;
                console.log(`[Gemini API] Child PDF uploaded: ${fileIdOrUrl}`);
              }

              // Update split row with dimensions
              await supabase
                .from("splits")
                .update({ page_width: pageWidth, page_height: pageHeight })
                .eq("id", splitId);

              // Process extraction
              extractionPromises.push(
                processExtractionForSplit(
                  supabase,
                  splitId,
                  tag,
                  fileIdOrUrl,
                  useFileId,
                  split.startPage
                )
              );
            }
          }
        } else {
          // ===== IMAGE/NON-PDF PATH: Use fileUrl directly, skip PDF operations =====
          console.log("[Gemini API] Non-PDF file detected (image/other) - using fileUrl directly");
          console.log("[Gemini API] Skipping PDF download/split operations");

          // Get image dimensions for citation bounding boxes
          let imageWidth: number | null = null;
          let imageHeight: number | null = null;
          try {
            const response = await fetch(signedUrlData.signedUrl);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const dimensions = imageSize(buffer);
            if (dimensions.width && dimensions.height) {
              imageWidth = dimensions.width;
              imageHeight = dimensions.height;
              console.log(`[Gemini API] Image dimensions: ${imageWidth}x${imageHeight}`);
            }
          } catch (e) {
            console.log("[Gemini API] Could not get image dimensions:", e);
          }

          for (let i = 0; i < geminiResult.splits.length; i++) {
            const split = geminiResult.splits[i];
            const splitId = splitIds[i];

            // Look up tag
            const tag =
              clientConfig.tags.find((t) => t.id === split.type) ??
              clientConfig.tags.find((t) => t.id === "other") ??
              clientConfig.tags[clientConfig.tags.length - 1];

            console.log(`[Gemini API] Split ${i}: tag=${tag.id}, processorId=${tag.extendProcessorId || "none"}`);

            // Store image dimensions in split row (for citation highlights)
            if (imageWidth && imageHeight) {
              await supabase
                .from("splits")
                .update({ page_width: imageWidth, page_height: imageHeight })
                .eq("id", splitId);
            }

            if (tag.extendProcessorId) {
              // Use signed URL directly for images - ExtendAI supports image URLs
              console.log(`[Gemini API] Calling ExtendAI with fileUrl for split ${i}`);

              extractionPromises.push(
                processExtractionForSplit(
                  supabase,
                  splitId,
                  tag,
                  signedUrlData.signedUrl,  // fileUrl directly
                  false,                      // useFileId = false
                  1                           // startPage always 1 for images
                )
              );
            }
          }
        }

        // Wait for all extractions to complete
        if (extractionPromises.length > 0) {
          console.log(
            `[Gemini API] Waiting for ${extractionPromises.length} extractions...`
          );
          await Promise.all(extractionPromises);
          console.log("[Gemini API] All extractions complete");
        }
      } else {
        console.log(
          "[Gemini API] Skipping extractions - EXTEND_API_KEY not configured"
        );
      }

      // Update document status to 'complete' - the documents_with_status view
      // computes 'computed_status' from splits.extraction_status automatically
      const { error: updateError } = await supabase
        .from("documents")
        .update({
          ...updateFields,
          // Cast to Json for Supabase compatibility (interfaces lack index signatures)
          page_ranges: updateFields.page_ranges as unknown as Json,
          gemini_response: updateFields.gemini_response as unknown as Json,
          status: "complete",
        })
        .eq("id", documentId);

      if (updateError) {
        throw new Error(`Failed to update document: ${updateError.message}`);
      }

      console.log("[Gemini API] Success:", documentId);

      // Send WhatsApp callback if this was a WhatsApp-sourced document
      const whatsAppPhone = req.headers["x-whatsapp-phone"] as string | undefined;
      if (whatsAppPhone) {
        console.log("[Gemini API] Sending WhatsApp callback to", whatsAppPhone);
        const firstSplit = geminiResult.splits[0];
        const tag = clientConfig.tags.find((t) => t.id === firstSplit?.type);
        const message = formatProcessingResult({
          filename: document.original_filename,
          documentType: tag?.displayName ?? firstSplit?.type ?? "Document",
          extractedData: { splits: geminiResult.splits.length },
          caseId: document.case_id,
          appUrl: process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : "http://localhost:3000",
        });
        await sendWhatsAppResult({ phone: whatsAppPhone, message });
      }

      return res.status(200).json(createSuccessResponse(geminiResult));
    } finally {
      // CLEANUP: Always delete the file from Google storage after processing
      // This prevents hitting the 20GB storage limit
      await deleteGoogleFile({
        fileName: googleFile.name,
        apiKey: process.env.GEMINI_API_KEY!,
      });
    }
  } catch (error) {
    console.log("[Gemini API] === ERROR ===");
    console.log("[Gemini API] Error type:", (error as Error)?.constructor?.name);
    console.log("[Gemini API] Error message:", (error as Error)?.message);
    console.log("[Gemini API] Error stack:", (error as Error)?.stack);

    const errorMessage = getProcessingErrorMessage(error);

    // Update document status to failed so UI doesn't get stuck in "processing"
    try {
      const validation = validateRequest(req.body);
      const errInternalSecret = req.headers["x-internal-secret"] as string | undefined;
      const errIsInternal = !!errInternalSecret && errInternalSecret === process.env.SUNDER_INTERNAL_SECRET;
      const token = extractToken(req.headers.authorization as string | undefined);

      if (validation.success && validation.data.documentId && (token || errIsInternal)) {
        const { documentId } = validation.data;
        if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
          return res.status(500).json({ success: false, error: "Supabase environment is not configured" });
        }
        const supabase = errIsInternal
          ? createClient<Database>(
              SUPABASE_URL,
              process.env.SUPABASE_SERVICE_ROLE_KEY!
            )
          : createClient<Database>(
              SUPABASE_URL,
              SUPABASE_ANON_KEY,
              {
                global: {
                  headers: { Authorization: `Bearer ${token}` },
                },
              }
            );
        await supabase
          .from("documents")
          .update({
            status: "failed",
            processing_error: errorMessage,
          })
          .eq("id", documentId);
        console.log("[Gemini API] Document status updated to failed");

        // Send WhatsApp callback for failures too
        const whatsAppPhone = req.headers["x-whatsapp-phone"] as string | undefined;
        if (whatsAppPhone) {
          const { data: doc } = await supabase
            .from("documents")
            .select("original_filename, case_id")
            .eq("id", documentId)
            .single();
          if (doc) {
            const message = formatProcessingResult({
              filename: doc.original_filename,
              error: errorMessage,
              caseId: doc.case_id,
              appUrl: process.env.VERCEL_URL
                ? `https://${process.env.VERCEL_URL}`
                : "http://localhost:3000",
            });
            await sendWhatsAppResult({ phone: whatsAppPhone, message });
          }
        }
      }
    } catch {
      // Don't throw - we still want to return the original error
    }

    return res.status(500).json({ success: false, error: errorMessage });
  }
}

/**
 * Calls Gemini API with retry logic using dynamic splitter schema.
 * @param fileUri - Google Files API URI
 * @param mimeType - MIME type of the file
 * @param prompt - Dynamic splitter prompt from client config
 * @param tagIds - Array of valid tag IDs from client config
 */
async function callGeminiWithRetry(
  fileUri: string,
  mimeType: string,
  prompt: string,
  tagIds: string[]
): Promise<DynamicSplitterResponse> {
  console.log("[Gemini API] Initializing Gemini client (splitter v2)...");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  // Create dynamic schema from client config tag IDs
  const dynamicSchema = createSplitterSchema(tagIds);

  // Convert Zod schema to JSON Schema using Zod v4 native method
  const jsonSchema = z.toJSONSchema(dynamicSchema, {
    target: "draft-07",
  });
  console.log("[Gemini API] JSON Schema (dynamic):", JSON.stringify(jsonSchema, null, 2));

  let lastError: Error = new Error("Unknown error");

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[Gemini API] Attempt ${attempt}/${MAX_RETRIES}`);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              createPartFromUri(fileUri, mimeType),
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchema,
        },
      });

      const responseText = response.text ?? "";
      console.log("[Gemini API] Raw response:", responseText);
      const parsed = dynamicSchema.parse(JSON.parse(responseText));
      console.log("[Gemini API] Parsed response:", JSON.stringify(parsed, null, 2));
      return parsed;
    } catch (error) {
      lastError = error as Error;
      console.log(`[Gemini API] Attempt ${attempt} failed:`, lastError.message);

      if (!shouldRetry(error)) {
        throw error;
      }

      if (attempt < MAX_RETRIES) {
        const backoff = calculateBackoff(attempt);
        console.log(`[Gemini API] Waiting ${backoff}ms before retry...`);
        await sleep(backoff);
      }
    }
  }

  throw lastError;
}
