/**
 * Storage tools for agent file read/write workflows.
 * @module lib/runner/tools/storage
 */
import { tool } from "ai";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { getFileExtension } from "@/lib/file-utils";
import { getSystemSkillContent, isSystemSkillPath } from "@/lib/runner/system-skills";
import { createAgentFileClient, normalizeWorkspacePath } from "@/lib/storage/agent-files";
import { toModelPath, toStoragePath } from "@/lib/storage/agent-paths";
import type { Database } from "@/types/database";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const IMAGE_MAX_DIMENSION = 1568;
const PDF_EXTENSIONS = new Set(["pdf"]);
const PDF_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const REMOVED_DOCUMENTS_DIRECTORY = ["va", "ult"].join("");
const REMOVED_DOCUMENTS_ERROR =
  `The "${REMOVED_DOCUMENTS_DIRECTORY}" directory has been removed. Use Google Drive for document storage instead.`;
const ROOT_MEMORY_FILE_PATHS = ["SOUL.md", "USER.md", "MEMORY.md"] as const;
const ROOT_MEMORY_FILE_SET = new Set<string>(ROOT_MEMORY_FILE_PATHS);
const MEMORY_TOPIC_PREFIX = "memory/";

const readFileInputSchema = z.object({
  path: z.string().describe(
    "Absolute path to the file or directory (for example '/agent/memory/MEMORY.md' or '/agent/home/').",
  ),
  start_line: z
    .number()
    .int()
    .optional()
    .describe("For text files only. The line to start reading from (1-indexed). Use negative numbers to count from the end (-1 = last line, -10 = 10th from last). Defaults to 1 if not specified."),
  end_line: z
    .number()
    .int()
    .optional()
    .describe("For text files only. The line to stop reading at (1-indexed, inclusive). Use negative numbers to count from the end (-1 = last line). Defaults to end of file if not specified."),
});

const writeFileInputSchema = z.object({
  op: z.enum(["write", "edit", "delete"]).describe("The operation type"),
  path: z.string().describe(
    "Absolute path to the file (for example '/agent/memory/topic.md' or '/agent/home/notes.md').",
  ),
  content: z.string().optional().describe("File content, overwrites existing content (required for write op)"),
  old_string: z.string().min(1).optional().describe("Exact text to find and replace in the file (required for edit op)"),
  new_string: z.string().optional().describe("Replacement text, can be empty to delete old_string (required for edit op)"),
  replace_all: z.boolean().optional().default(false).describe("If true, replace all occurrences. If false (default), fails on multiple matches."),
});
type StoragePathKind = "skills" | "general";

/**
 * Creates storage tools for one client.
 *
 * The tool factory closes over `clientId` to enforce tenant scoping.
 */
export function createStorageTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const fileClient = createAgentFileClient(supabase, clientId);

  const read_file = tool({
    description:
      "Reads the contents of a file or directory by its path. If the path is a directory, returns a recursive tree-style listing of its contents. Image files and PDFs are displayed directly. Specify optional start_line/end_line for large text files. Use negative indices to count from the end (e.g., start_line: -10, end_line: -1 reads the last 10 lines).",
    inputSchema: readFileInputSchema,
    execute: async ({ path, start_line, end_line }) => {
      assertValidReadLineBounds(start_line, end_line);
      const internalPath = toStoragePath(path);
      assertRemovedDocumentsPathIsAvailable(normalizeWorkspacePath(internalPath, true));
      const modelPath = toModelPath(internalPath);
      const fileType = classifyFileType(internalPath);

      if (fileType === "directory") {
        const directoryPath = internalPath.replace(/\/+$/, "");
        const content = await fileClient.listDirectory(directoryPath);
        return { success: true as const, path: modelPath, content };
      }

      if (fileType === "image") {
        const { buffer } = await fileClient.downloadBinary(internalPath);
        const image = await resizeForModel(buffer);
        return { success: true as const, path: modelPath, type: "image" as const, ...image };
      }

      if (fileType === "pdf") {
        const { buffer } = await fileClient.downloadBinary(internalPath);
        if (buffer.byteLength > PDF_MAX_SIZE_BYTES) {
          const sizeMb = (buffer.byteLength / (1024 * 1024)).toFixed(1);
          throw new Error(
            `PDF "${internalPath}" exceeds 10 MB size limit (${sizeMb} MB). ` +
            "Ask the user for a smaller file or a specific section.",
          );
        }
        const data = Buffer.from(buffer).toString("base64");
        return { success: true as const, path: modelPath, type: "pdf" as const, data, mediaType: "application/pdf" as const };
      }

      try {
        const rawContent = await fileClient.downloadFile(internalPath);
        const storedImageArtifact = parseStoredImageArtifact(internalPath, rawContent);
        if (storedImageArtifact) {
          return storedImageArtifact;
        }
        const slicedContent = applyLineRange(rawContent, start_line, end_line);

        return { success: true as const, path: modelPath, content: slicedContent };
      } catch (fileError) {
        // Try bundled system skill fallback for any storage error (the fs
        // read returns null when the bundled file doesn't exist, so this is
        // always safe and avoids coupling to specific error message strings).
        if (isSystemSkillPath(internalPath)) {
          const bundledContent = await getSystemSkillContent(internalPath);
          if (bundledContent !== null) {
            return { success: true as const, path: modelPath, content: bundledContent };
          }
        }

        if (!shouldFallbackToDirectory(fileError)) {
          throw fileError;
        }

        try {
          const content = await fileClient.listDirectory(internalPath);
          return { success: true as const, path: modelPath, content };
        } catch {
          throw fileError;
        }
      }
    },
    toModelOutput({ output }) {
      if (isImageReadResult(output)) {
        return {
          type: "content" as const,
          value: [{ type: "image-data" as const, data: output.data, mediaType: output.mediaType }],
        };
      }

      if (isPdfReadResult(output)) {
        return {
          type: "content" as const,
          value: [{ type: "file-data" as const, data: output.data, mediaType: output.mediaType }],
        };
      }

      return {
        type: "json" as const,
        value: output,
      };
    },
  });

  const write_file = tool({
    description: "Creates, edits, or deletes a file in the filesystem. Supports three operations: write (create or overwrite), edit (find and replace text), and delete.",
    inputSchema: writeFileInputSchema,
    execute: async ({ op, path, content, old_string, new_string, replace_all }) => {
      const internalPath = toStoragePath(path);
      const normalizedPath = normalizeWorkspacePath(internalPath, false);
      assertRemovedDocumentsPathIsAvailable(normalizedPath);
      const modelPath = toModelPath(normalizedPath);
      const pathKind = classifyStoragePath(normalizedPath);
      const shouldReplaceAll = replace_all ?? false;

      switch (op) {
        case "write": {
          if (content === undefined) {
            throw new Error("write op requires content.");
          }

          await fileClient.uploadFile(normalizedPath, content);
          await captureMemoryWriteEvent({
            clientId,
            operation: op,
            path: normalizedPath,
            content,
            source: "agent",
          });
          return { success: true as const, op, path: modelPath, path_kind: pathKind };
        }

        case "edit": {
          if (old_string === undefined || new_string === undefined) {
            throw new Error("edit op requires old_string and new_string.");
          }

          const updatedContent = await fileClient.editFile(
            normalizedPath,
            old_string,
            new_string,
            shouldReplaceAll,
          );
          await captureMemoryWriteEvent({
            clientId,
            operation: op,
            path: normalizedPath,
            content: updatedContent,
            source: "agent",
          });
          return {
            success: true as const,
            op,
            path: modelPath,
            content: updatedContent,
            path_kind: pathKind,
          };
        }

        case "delete": {
          await fileClient.deleteFile(normalizedPath);
          return { success: true as const, op, path: modelPath, path_kind: pathKind };
        }
      }
    },
  });

  return {
    read_file,
    write_file,
  };
}

/**
 * Applies optional line slicing to text content.
 *
 * Indices are 1-based and inclusive.
 */
function applyLineRange(content: string, startLine?: number, endLine?: number): string {
  if (startLine === undefined && endLine === undefined) {
    return content;
  }

  assertValidReadLineBounds(startLine, endLine);

  const lines = content.split("\n");
  const totalLines = lines.length;

  const toZeroIndex = (value: number): number => {
    if (value > 0) {
      return value - 1;
    }

    return Math.max(0, totalLines + value);
  };

  const startIndex = startLine === undefined ? 0 : toZeroIndex(startLine);
  const endIndex = endLine === undefined ? totalLines - 1 : toZeroIndex(endLine);

  if (startLine !== undefined && endLine !== undefined && endIndex < startIndex) {
    throw new Error("end_line must be greater than or equal to start_line.");
  }

  return lines.slice(startIndex, endIndex + 1).join("\n");
}

/**
 * Classifies a workspace path so `read_file` can choose the correct read flow.
 *
 * @param path - Relative file or directory path in the client workspace.
 */
function classifyFileType(path: string): "directory" | "image" | "pdf" | "text" {
  if (path === "" || path.endsWith("/")) {
    return "directory";
  }

  const ext = getFileExtension(path);
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (PDF_EXTENSIONS.has(ext)) return "pdf";
  return "text";
}

/**
 * Resizes and re-encodes an image for model consumption.
 *
 * Images are capped to a 1568px longest side. Alpha images stay PNG to preserve
 * transparency; opaque images are converted to JPEG to reduce payload size.
 *
 * @param buffer - Raw image bytes from storage.
 */
async function resizeForModel(buffer: ArrayBuffer): Promise<{ data: string; mediaType: string }> {
  const input = Buffer.from(buffer);
  const metadata = await sharp(input).metadata();
  const pipeline = sharp(input).autoOrient().resize(IMAGE_MAX_DIMENSION, IMAGE_MAX_DIMENSION, {
    fit: "inside",
    withoutEnlargement: true,
  });

  if (metadata.hasAlpha) {
    const output = await pipeline.png().toBuffer();
    return { data: output.toString("base64"), mediaType: "image/png" };
  }

  const output = await pipeline.jpeg({ quality: 85 }).toBuffer();
  return { data: output.toString("base64"), mediaType: "image/jpeg" };
}

/**
 * Rejects `0` for line bounds before the read flow branches by file type.
 *
 * `start_line` / `end_line` are 1-indexed and may be negative, but `0` is never valid.
 */
function assertValidReadLineBounds(startLine?: number, endLine?: number): void {
  if (startLine === 0) {
    throw new Error("start_line cannot be 0.");
  }

  if (endLine === 0) {
    throw new Error("end_line cannot be 0.");
  }
}

/** Narrows a `read_file` output to a binary result variant (image or pdf) used by `toModelOutput`. */
function isBinaryReadResult(
  value: unknown,
  expectedType: "image" | "pdf",
): value is { type: string; data: string; mediaType: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "data" in value &&
    "mediaType" in value &&
    (value as { type?: unknown }).type === expectedType &&
    typeof (value as { data?: unknown }).data === "string" &&
    typeof (value as { mediaType?: unknown }).mediaType === "string"
  );
}

function isImageReadResult(value: unknown): value is { type: "image"; data: string; mediaType: string } {
  return isBinaryReadResult(value, "image");
}

function isPdfReadResult(value: unknown): value is { type: "pdf"; data: string; mediaType: string } {
  return isBinaryReadResult(value, "pdf");
}

/**
 * Restores persisted image tool artifacts so `read_file("toolcalls/{id}/result.json")`
 * can recover the original image for the model after truncation.
 *
 * @param path - Workspace-relative path being read.
 * @param content - Raw file contents returned by storage.
 */
function parseStoredImageArtifact(
  path: string,
  content: string,
): { success: true; path: string; type: "image"; data: string; mediaType: string } | null {
  if (!/^toolcalls\/[^/]+\/result\.json$/u.test(path)) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    if (!isImageReadResult(parsed)) {
      return null;
    }

    const parsedPath = (parsed as { path?: unknown }).path;
    const outputPath = typeof parsedPath === "string" ? toModelPath(parsedPath) : toModelPath(path);

    return {
      success: true,
      path: outputPath,
      type: "image",
      data: parsed.data,
      mediaType: parsed.mediaType,
    };
  } catch {
    return null;
  }
}

function shouldFallbackToDirectory(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  if (message.includes("permission denied") || message.includes("forbidden") || message.includes("unauthorized")) {
    return false;
  }

  if (message.includes("bucket not found")) {
    return false;
  }

  return message.includes("object not found")
    || message.includes("file not found")
    || message.includes("no such file");
}

function classifyStoragePath(path: string): StoragePathKind {
  if (path === "skills" || path.startsWith("skills/")) {
    return "skills";
  }

  return "general";
}

function assertRemovedDocumentsPathIsAvailable(normalizedPath: string): void {
  if (
    normalizedPath === REMOVED_DOCUMENTS_DIRECTORY
    || normalizedPath.startsWith(`${REMOVED_DOCUMENTS_DIRECTORY}/`)
  ) {
    throw new Error(REMOVED_DOCUMENTS_ERROR);
  }
}

function isMemoryFilePath(path: string): boolean {
  return ROOT_MEMORY_FILE_SET.has(path) || path.startsWith(MEMORY_TOPIC_PREFIX);
}

async function captureMemoryWriteEvent(params: {
  clientId: string;
  operation: "write" | "edit";
  path: string;
  content: string;
  source: "agent" | "dashboard";
}): Promise<void> {
  if (!isMemoryFilePath(params.path)) {
    return;
  }

  await captureServerEvent({
    distinctId: params.clientId,
    event: "memory_file_saved",
    properties: {
      filename: params.path,
      operation: params.operation,
      size_bytes: new TextEncoder().encode(params.content).byteLength,
      source: params.source,
    },
  });
}
