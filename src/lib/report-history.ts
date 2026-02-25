/**
 * @fileoverview Helper for saving AI-generated files to Report History.
 * Downloads files from URLs or fetches by file_id, uploads to Supabase storage,
 * and inserts records into the report_history table.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Parameters for saving a generated file to Report History.
 */
export interface SaveFileParams {
  /** The case ID to associate the file with */
  caseId: string;
  /** The filename for display and storage */
  filename: string;
  /** Hosted URL (from AI SDK streaming response) - will be downloaded and re-uploaded */
  url?: string;
  /** Anthropic file_id (from direct SDK first message response) */
  fileId?: string;
  /** MIME type of the file */
  mediaType?: string;
  /** User ID who generated this report (required for report_history) */
  generatedBy: string;
  /** Number of splits included (defaults to 0 for AI chat) */
  splitsCount?: number;
  /** Tags included in the analysis (defaults to empty array) */
  tagsIncluded?: string[];
  /** Authenticated Supabase client */
  supabase: SupabaseClient<Database>;
}

/**
 * Saves a generated file to Report History.
 *
 * Flow:
 * 1. Download file content (from URL or Anthropic file_id)
 * 2. Upload to Supabase 'reports' storage bucket
 * 3. Insert record into 'report_history' table
 *
 * @example
 * // From AI SDK streaming response (has URL)
 * await saveGeneratedFileToReportHistory({
 *   caseId: "case-123",
 *   filename: "analysis.xlsx",
 *   url: "https://files.anthropic.com/...",
 *   generatedBy: userId,
 *   supabase,
 * });
 *
 * @example
 * // From Anthropic SDK first message (has file_id)
 * await saveGeneratedFileToReportHistory({
 *   caseId: "case-123",
 *   filename: "report.pdf",
 *   fileId: "file_abc123",
 *   generatedBy: userId,
 *   supabase,
 * });
 */
export async function saveGeneratedFileToReportHistory({
  caseId,
  filename,
  url,
  fileId,
  mediaType,
  generatedBy,
  splitsCount = 0,
  tagsIncluded = [],
  supabase,
}: SaveFileParams): Promise<void> {
  let fileBlob: Blob;

  // Get file content from URL or file_id
  if (url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download file from URL: ${response.status}`);
    }
    fileBlob = await response.blob();
  } else if (fileId) {
    // Download file content from Anthropic Files API
    const anthropicClient = new Anthropic();
    const response = await anthropicClient.beta.files.download(fileId, {
      betas: ["files-api-2025-04-14"],
    });
    // files.download() returns a Response object - extract blob for upload
    fileBlob = await response.blob();
  } else {
    throw new Error("Either url or fileId must be provided");
  }

  // Upload to Supabase Storage
  const timestamp = Date.now();
  const storagePath = `${caseId}/${timestamp}_${filename}`;

  const { error: uploadError } = await supabase.storage
    .from("reports")
    .upload(storagePath, fileBlob, {
      contentType: mediaType ?? "application/octet-stream",
    });

  if (uploadError) {
    throw new Error(`Failed to upload file: ${uploadError.message}`);
  }

  // Insert into report_history table
  const { error: insertError } = await supabase
    .from("report_history")
    .insert({
      case_id: caseId,
      report_type: "ai_analysis",
      name: filename,
      file_path: storagePath,
      splits_count: splitsCount,
      tags_included: tagsIncluded,
      generated_by: generatedBy,
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(`Failed to insert report history: ${insertError.message}`);
  }
}
