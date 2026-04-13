/**
 * storage_read tool for managed agents.
 *
 * @module lib/managed-agents/tools/storage/storage-read
 */
import { z } from "zod";

import type { ManagedAgentTool } from "../types";
import {
  applyLineRange,
  assertValidReadLineBounds,
  getStorageFileClient,
  isImageReadResult,
  isPdfReadResult,
  parseStoredImageArtifact,
  PDF_MAX_SIZE_BYTES,
  resolveStorageReadPath,
  resizeForModel,
  shouldFallbackToDirectory,
} from "./shared";

const inputSchema = z.object({
  path: z.string().describe(
    "Absolute path to the file or directory (for example '/agent/memory/MEMORY.md' or '/agent/home/').",
  ),
  start_line: z
    .number()
    .int()
    .optional()
    .describe(
      "For text files only. The line to start reading from (1-indexed). Use negative numbers to count from the end (-1 = last line, -10 = 10th from last). Defaults to 1 if not specified.",
    ),
  end_line: z
    .number()
    .int()
    .optional()
    .describe(
      "For text files only. The line to stop reading at (1-indexed, inclusive). Use negative numbers to count from the end (-1 = last line). Defaults to end of file if not specified.",
    ),
});

type StorageReadInput = z.infer<typeof inputSchema>;

export const storageReadTool: ManagedAgentTool<StorageReadInput> = {
  name: "storage_read",
  description:
    "Reads the contents of a file or directory by its path. If the path is a directory, returns a recursive tree-style listing of its contents. Image files and PDFs are displayed directly. Specify optional start_line/end_line for large text files. Use negative indices to count from the end (e.g., start_line: -10, end_line: -1 reads the last 10 lines).",
  inputSchema,
  execute: async ({ path, start_line, end_line }, context) => {
    assertValidReadLineBounds(start_line, end_line);

    const fileClient = getStorageFileClient(context);
    const { internalPath, modelPath, fileType } = resolveStorageReadPath(path);

    console.info("[storage_read] resolved path", {
      clientId: context.clientId,
      requestedPath: path,
      internalPath,
      modelPath,
      fileType,
      startLine: start_line ?? null,
      endLine: end_line ?? null,
    });

    if (fileType === "directory") {
      const directoryPath = internalPath.replace(/\/+$/, "");
      const content = await fileClient.listDirectory(directoryPath);
      console.info("[storage_read] directory read succeeded", {
        clientId: context.clientId,
        requestedPath: path,
        internalPath: directoryPath,
      });
      return { success: true as const, path: modelPath, content };
    }

    if (fileType === "image") {
      const { buffer } = await fileClient.downloadBinary(internalPath);
      const image = await resizeForModel(buffer);
      console.info("[storage_read] image read succeeded", {
        clientId: context.clientId,
        requestedPath: path,
        internalPath,
        sizeBytes: buffer.byteLength,
      });
      return { success: true as const, path: modelPath, type: "image" as const, ...image };
    }

    if (fileType === "pdf") {
      const { buffer } = await fileClient.downloadBinary(internalPath);
      if (buffer.byteLength > PDF_MAX_SIZE_BYTES) {
        const sizeMb = (buffer.byteLength / (1024 * 1024)).toFixed(1);
        throw new Error(
          `PDF "${internalPath}" exceeds 10 MB size limit (${sizeMb} MB). Ask the user for a smaller file or a specific section.`,
        );
      }

      const data = Buffer.from(buffer).toString("base64");
      console.info("[storage_read] pdf read succeeded", {
        clientId: context.clientId,
        requestedPath: path,
        internalPath,
        sizeBytes: buffer.byteLength,
      });
      return {
        success: true as const,
        path: modelPath,
        type: "pdf" as const,
        data,
        mediaType: "application/pdf" as const,
      };
    }

    try {
      const rawContent = await fileClient.downloadFile(internalPath);
      const storedImageArtifact = parseStoredImageArtifact(internalPath, rawContent);
      if (storedImageArtifact) {
        return storedImageArtifact;
      }

      return {
        success: true as const,
        path: modelPath,
        content: applyLineRange(rawContent, start_line, end_line),
      };
    } catch (fileError) {
      console.warn("[storage_read] primary read failed", {
        clientId: context.clientId,
        requestedPath: path,
        internalPath,
        fileType,
        error: fileError instanceof Error ? fileError.message : String(fileError),
      });
      if (!shouldFallbackToDirectory(fileError)) {
        throw fileError;
      }

      try {
        const content = await fileClient.listDirectory(internalPath);
        console.info("[storage_read] fallback directory read succeeded", {
          clientId: context.clientId,
          requestedPath: path,
          internalPath,
        });
        return { success: true as const, path: modelPath, content };
      } catch {
        throw fileError;
      }
    }
  },
};

export function toStorageReadModelOutput(output: unknown) {
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
}
