/**
 * @file Google Files API utilities for Gemini document processing.
 * @description Handles uploading files to Google's Files API and polling for processing completion.
 */
import { GoogleGenAI } from "@google/genai";

/**
 * Parameters for uploading a file to Google Files API.
 */
export interface UploadToGoogleFilesParams {
  /** File content as a Buffer */
  fileBuffer: Buffer;
  /** MIME type of the file (e.g., "application/pdf") */
  mimeType: string;
  /** Display name for the file in Google's system */
  displayName: string;
  /** Google API key */
  apiKey: string;
}

/**
 * Response from Google Files API upload.
 */
export interface GoogleFileMetadata {
  /** Resource name (e.g., "files/abc123") */
  name: string;
  /** URI to reference in generateContent */
  uri: string;
  /** MIME type of the file */
  mimeType: string;
  /** Processing state: PROCESSING, ACTIVE, or FAILED */
  state: string;
}

/**
 * Uploads a file buffer to Google Files API.
 * Use this instead of direct URL references for reliable processing of all file sizes.
 *
 * @param params - Upload parameters
 * @returns Google file metadata including URI for generateContent
 */
export async function uploadToGoogleFiles(
  params: UploadToGoogleFilesParams
): Promise<GoogleFileMetadata> {
  const { fileBuffer, mimeType, displayName, apiKey } = params;

  console.log("[Gemini Files] Uploading to Google Files API...");
  console.log("[Gemini Files] Size:", fileBuffer.length, "bytes, MIME:", mimeType);
  const ai = new GoogleGenAI({ apiKey });

  const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });

  const file = await ai.files.upload({
    file: blob,
    config: {
      mimeType,
      displayName,
    },
  });

  console.log("[Gemini Files] Upload complete:", file.name, "state:", file.state);
  return file as GoogleFileMetadata;
}

/**
 * Parameters for waiting on file processing.
 */
export interface WaitForFileProcessingParams {
  /** File name returned from upload (e.g., "files/abc123") */
  fileName: string;
  /** Google API key */
  apiKey: string;
  /** Polling interval in milliseconds (default: 2000) */
  pollIntervalMs?: number;
  /** Maximum polling attempts (default: 30 = 60 seconds) */
  maxAttempts?: number;
}

/**
 * Polls Google Files API until file processing completes.
 * Files need to be in ACTIVE state before they can be used in generateContent.
 *
 * @param params - Polling parameters
 * @returns File metadata with ACTIVE state
 * @throws Error if file processing fails or times out
 */
export async function waitForFileProcessing(
  params: WaitForFileProcessingParams
): Promise<GoogleFileMetadata> {
  const {
    fileName,
    apiKey,
    pollIntervalMs = 2000,
    maxAttempts = 30,
  } = params;

  console.log("[Gemini Files] Waiting for processing:", fileName);
  const ai = new GoogleGenAI({ apiKey });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const file = await ai.files.get({ name: fileName });

    if (file.state === "ACTIVE") {
      console.log("[Gemini Files] File ready (ACTIVE)");
      return file as GoogleFileMetadata;
    }

    if (file.state === "FAILED") {
      console.log("[Gemini Files] File processing FAILED");
      throw new Error("File processing failed");
    }

    // Still PROCESSING, wait and retry
    if (attempt < maxAttempts) {
      console.log(`[Gemini Files] Still PROCESSING, poll ${attempt}/${maxAttempts}...`);
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  throw new Error("File processing timed out");
}

/**
 * Parameters for upload and wait operation.
 */
export interface UploadAndWaitParams extends UploadToGoogleFilesParams {
  /** Polling interval in milliseconds (default: 2000) */
  pollIntervalMs?: number;
  /** Maximum polling attempts (default: 30) */
  maxAttempts?: number;
}

/**
 * Uploads a file to Google Files API and waits for processing to complete.
 * This is the main function to use for document processing workflows.
 *
 * @param params - Upload and polling parameters
 * @returns File metadata with ACTIVE state, ready for generateContent
 */
export async function uploadAndWaitForFile(
  params: UploadAndWaitParams
): Promise<GoogleFileMetadata> {
  const {
    fileBuffer,
    mimeType,
    displayName,
    apiKey,
    pollIntervalMs,
    maxAttempts,
  } = params;

  // Upload file
  const uploadedFile = await uploadToGoogleFiles({
    fileBuffer,
    mimeType,
    displayName,
    apiKey,
  });

  // If already ACTIVE, return immediately
  if (uploadedFile.state === "ACTIVE") {
    return uploadedFile;
  }

  // Otherwise poll until ready
  return waitForFileProcessing({
    fileName: uploadedFile.name,
    apiKey,
    pollIntervalMs,
    maxAttempts,
  });
}

/**
 * Downloads a file from a URL and returns it as a Buffer.
 * Used to fetch files from Supabase signed URLs before uploading to Google Files API.
 *
 * @param url - The URL to download from (e.g., Supabase signed URL)
 * @returns File contents as a Buffer
 * @throws Error if download fails
 */
export async function downloadFileFromUrl(url: string): Promise<Buffer> {
  console.log("[Gemini Files] Downloading from Supabase...");
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to download file: ${response.status} ${response.statusText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log("[Gemini Files] Downloaded:", buffer.length, "bytes");
  return buffer;
}

/**
 * Parameters for the full file preparation pipeline.
 */
export interface PrepareFileForGeminiParams {
  /** Source URL to download file from (e.g., Supabase signed URL) */
  sourceUrl: string;
  /** MIME type of the file */
  mimeType: string;
  /** Display name for the file in Google's system */
  displayName: string;
  /** Google API key */
  apiKey: string;
  /** Polling interval in milliseconds (default: 2000) */
  pollIntervalMs?: number;
  /** Maximum polling attempts (default: 30) */
  maxAttempts?: number;
}

/**
 * Full pipeline: downloads file from source URL, uploads to Google Files API,
 * and waits for processing to complete.
 *
 * This is the main entry point for the API endpoint to use.
 *
 * @param params - Pipeline parameters
 * @returns Google file metadata with URI ready for generateContent
 */
export async function prepareFileForGemini(
  params: PrepareFileForGeminiParams
): Promise<GoogleFileMetadata> {
  const {
    sourceUrl,
    mimeType,
    displayName,
    apiKey,
    pollIntervalMs,
    maxAttempts,
  } = params;

  // Step 1: Download from source (Supabase)
  const fileBuffer = await downloadFileFromUrl(sourceUrl);

  // Step 2: Upload to Google and wait for processing
  return uploadAndWaitForFile({
    fileBuffer,
    mimeType,
    displayName,
    apiKey,
    pollIntervalMs,
    maxAttempts,
  });
}

/**
 * Parameters for deleting a file from Google Files API.
 */
export interface DeleteGoogleFileParams {
  /** File name returned from upload (e.g., "files/abc123") */
  fileName: string;
  /** Google API key */
  apiKey: string;
}

/**
 * Deletes a file from Google Files API.
 * Used to clean up after processing to avoid hitting the 20GB storage limit.
 * Silently ignores errors (best-effort cleanup).
 *
 * @param params - Delete parameters
 */
export async function deleteGoogleFile(
  params: DeleteGoogleFileParams
): Promise<void> {
  const { fileName, apiKey } = params;

  try {
    console.log("[Gemini Files] Deleting file:", fileName);
    const ai = new GoogleGenAI({ apiKey });
    await ai.files.delete({ name: fileName });
    console.log("[Gemini Files] File deleted");
  } catch (error) {
    // Silent cleanup - don't fail the main operation if delete fails
    // File will be auto-deleted after 48 hours anyway
    console.log("[Gemini Files] Delete failed (ignored):", (error as Error)?.message);
  }
}
