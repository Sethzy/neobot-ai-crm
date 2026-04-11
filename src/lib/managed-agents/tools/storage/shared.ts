/**
 * Shared helpers for managed-agent storage tools.
 *
 * @module lib/managed-agents/tools/storage/shared
 */
import sharp from "sharp";

import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { getFileExtension } from "@/lib/file-utils";
import { createAgentFileClient, normalizeWorkspacePath } from "@/lib/storage/agent-files";
import { toModelPath, toStoragePath } from "@/lib/storage/agent-paths";
import { getSystemSkillContent, isSystemSkillPath } from "@/lib/runner/skills/system-skills";

import type { ToolContext } from "../types";

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

export type StoragePathKind = "skills" | "general";

export function getStorageFileClient(context: ToolContext) {
  return createAgentFileClient(context.supabase, context.clientId);
}

export function applyLineRange(
  content: string,
  startLine?: number,
  endLine?: number,
): string {
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

export function classifyFileType(path: string): "directory" | "image" | "pdf" | "text" {
  if (path === "" || path.endsWith("/")) {
    return "directory";
  }

  const ext = getFileExtension(path);
  if (IMAGE_EXTENSIONS.has(ext)) {
    return "image";
  }
  if (PDF_EXTENSIONS.has(ext)) {
    return "pdf";
  }
  return "text";
}

export async function resizeForModel(
  buffer: ArrayBuffer,
): Promise<{ data: string; mediaType: string }> {
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

export function assertValidReadLineBounds(startLine?: number, endLine?: number): void {
  if (startLine === 0) {
    throw new Error("start_line cannot be 0.");
  }

  if (endLine === 0) {
    throw new Error("end_line cannot be 0.");
  }
}

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

export function isImageReadResult(
  value: unknown,
): value is { type: "image"; data: string; mediaType: string } {
  return isBinaryReadResult(value, "image");
}

export function isPdfReadResult(
  value: unknown,
): value is { type: "pdf"; data: string; mediaType: string } {
  return isBinaryReadResult(value, "pdf");
}

export function parseStoredImageArtifact(
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
    const outputPath =
      typeof parsedPath === "string" ? toModelPath(parsedPath) : toModelPath(path);

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

export function shouldFallbackToDirectory(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  if (
    message.includes("permission denied") ||
    message.includes("forbidden") ||
    message.includes("unauthorized")
  ) {
    return false;
  }

  if (message.includes("bucket not found")) {
    return false;
  }

  return (
    message.includes("object not found") ||
    message.includes("file not found") ||
    message.includes("no such file")
  );
}

export function classifyStoragePath(path: string): StoragePathKind {
  if (path === "skills" || path.startsWith("skills/")) {
    return "skills";
  }

  return "general";
}

export function assertRemovedDocumentsPathIsAvailable(normalizedPath: string): void {
  if (
    normalizedPath === REMOVED_DOCUMENTS_DIRECTORY ||
    normalizedPath.startsWith(`${REMOVED_DOCUMENTS_DIRECTORY}/`)
  ) {
    throw new Error(REMOVED_DOCUMENTS_ERROR);
  }
}

function isMemoryFilePath(path: string): boolean {
  return ROOT_MEMORY_FILE_SET.has(path) || path.startsWith(MEMORY_TOPIC_PREFIX);
}

export async function captureMemoryWriteEvent(params: {
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

export function resolveStorageReadPath(path: string) {
  const internalPath = toStoragePath(path);
  assertRemovedDocumentsPathIsAvailable(normalizeWorkspacePath(internalPath, true));

  return {
    internalPath,
    modelPath: toModelPath(internalPath),
    fileType: classifyFileType(internalPath),
  };
}

export function resolveStorageWritePath(path: string) {
  const internalPath = toStoragePath(path);
  const normalizedPath = normalizeWorkspacePath(internalPath, false);
  assertRemovedDocumentsPathIsAvailable(normalizedPath);

  return {
    normalizedPath,
    modelPath: toModelPath(normalizedPath),
    pathKind: classifyStoragePath(normalizedPath),
  };
}

export async function loadBundledSystemSkillIfAvailable(path: string, modelPath: string) {
  if (!isSystemSkillPath(path)) {
    return null;
  }

  const bundledContent = await getSystemSkillContent(path);
  if (bundledContent === null) {
    return null;
  }

  return {
    success: true as const,
    path: modelPath,
    content: bundledContent,
  };
}

export { PDF_MAX_SIZE_BYTES };
