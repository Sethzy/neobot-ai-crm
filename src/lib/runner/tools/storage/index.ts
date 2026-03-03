/**
 * Storage tools for agent file read/write workflows.
 * @module lib/runner/tools/storage
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { createAgentFileClient, normalizeWorkspacePath } from "@/lib/storage/agent-files";
import type { Database } from "@/types/database";

const readFileInputSchema = z.object({
  path: z.string().describe("Relative file or directory path in the client workspace."),
  start_line: z.number().int().min(1).optional().describe("Optional 1-indexed start line."),
  end_line: z.number().int().min(1).optional().describe("Optional 1-indexed end line (inclusive)."),
});

const writeFileInputSchema = z.object({
  op: z.enum(["write", "edit", "delete"]),
  path: z.string().describe("Relative file path in the client workspace."),
  content: z.string().optional().describe("Required for write operations."),
  old_string: z.string().optional().describe("Required for edit operations."),
  new_string: z.string().optional().describe("Required for edit operations."),
  replace_all: z.boolean().optional().default(false),
});
type StoragePathKind = "vault" | "skills" | "general";
const VAULT_SYNC_MAX_ATTEMPTS = 3;
const VAULT_SYNC_BASE_DELAY_MS = 50;

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
      "Read file content or list a directory tree. Use directory paths (e.g. memory/) for discovery.",
    inputSchema: readFileInputSchema,
    execute: async ({ path, start_line, end_line }) => {
      const isDirectoryPath = path === "" || path.endsWith("/");

      if (isDirectoryPath) {
        const directoryPath = path.replace(/\/+$/, "");
        const content = await fileClient.listDirectory(directoryPath);
        return { success: true as const, path, content };
      }

      try {
        const rawContent = await fileClient.downloadFile(path);
        const slicedContent = applyLineRange(rawContent, start_line, end_line);

        return { success: true as const, path, content: slicedContent };
      } catch (fileError) {
        if (!shouldFallbackToDirectory(fileError)) {
          throw fileError;
        }

        try {
          const content = await fileClient.listDirectory(path);
          return { success: true as const, path, content };
        } catch {
          throw fileError;
        }
      }
    },
  });

  const write_file = tool({
    description: "Write, edit, or delete files in the client workspace.",
    inputSchema: writeFileInputSchema,
    execute: async ({ op, path, content, old_string, new_string, replace_all }) => {
      const normalizedPath = normalizeWorkspacePath(path, false);
      const pathKind = classifyStoragePath(normalizedPath);

      switch (op) {
        case "write": {
          if (content === undefined) {
            throw new Error("write op requires content.");
          }

          await fileClient.uploadFile(normalizedPath, content);
          await runPathAwareSync({
            op,
            path: normalizedPath,
            pathKind,
            content,
            supabase,
            clientId,
          });
          return { success: true as const, op, path: normalizedPath, path_kind: pathKind };
        }

        case "edit": {
          if (old_string === undefined || new_string === undefined) {
            throw new Error("edit op requires old_string and new_string.");
          }

          const updatedContent = await fileClient.editFile(
            normalizedPath,
            old_string,
            new_string,
            replace_all,
          );
          await runPathAwareSync({
            op,
            path: normalizedPath,
            pathKind,
            content: updatedContent,
            supabase,
            clientId,
          });
          return {
            success: true as const,
            op,
            path: normalizedPath,
            content: updatedContent,
            path_kind: pathKind,
          };
        }

        case "delete": {
          await fileClient.deleteFile(normalizedPath);
          await runPathAwareSync({ op, path: normalizedPath, pathKind, supabase, clientId });
          return { success: true as const, op, path: normalizedPath, path_kind: pathKind };
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

  if (startLine !== undefined && startLine < 1) {
    throw new Error("start_line must be >= 1.");
  }

  if (endLine !== undefined && endLine < 1) {
    throw new Error("end_line must be >= 1.");
  }

  if (startLine !== undefined && endLine !== undefined && endLine < startLine) {
    throw new Error("end_line must be greater than or equal to start_line.");
  }

  const lines = content.split("\n");
  const totalLines = lines.length;

  const toIndex = (value: number, isEnd = false): number => {
    const fromStart = value - 1 + (isEnd ? 1 : 0);
    return Math.max(0, fromStart);
  };

  const startIndex = startLine === undefined ? 0 : toIndex(startLine);
  const endIndex = endLine === undefined ? totalLines : toIndex(endLine, true);

  return lines.slice(startIndex, endIndex).join("\n");
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
  if (path === "vault" || path.startsWith("vault/")) {
    return "vault";
  }

  if (path === "skills" || path.startsWith("skills/")) {
    return "skills";
  }

  return "general";
}

async function runPathAwareSync(params: {
  op: "write" | "edit" | "delete";
  path: string;
  pathKind: StoragePathKind;
  content?: string;
  supabase: SupabaseClient<Database>;
  clientId: string;
}): Promise<void> {
  if (params.pathKind === "general" || params.pathKind === "skills") {
    return;
  }

  if (params.op === "delete") {
    await withRetryableVaultSync(async () => {
      const { error } = await params.supabase
        .from("vault_files")
        .delete()
        .eq("client_id", params.clientId)
        .eq("storage_path", params.path);
      return error;
    }, "delete");

    return;
  }

  const filename = getFileNameFromPath(params.path);
  const title = deriveTitleFromFilename(filename);
  const textContent = params.content ?? null;
  const contentSizeBytes = textContent === null ? null : new TextEncoder().encode(textContent).length;
  const extension = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() : "";
  const contentType = extension === "md" || extension === "markdown"
    ? "text/markdown"
    : extension === "txt"
      ? "text/plain"
      : null;

  await withRetryableVaultSync(async () => {
    const { error } = await params.supabase
      .from("vault_files")
      .upsert(
        {
          client_id: params.clientId,
          filename,
          storage_path: params.path,
          title,
          content_type: contentType,
          size_bytes: contentSizeBytes,
          content: textContent,
          needs_reprocess: true,
        },
        { onConflict: "client_id,storage_path" },
      );
    return error;
  }, "upsert");
}

async function withRetryableVaultSync(
  operation: () => Promise<{ message: string } | null>,
  operationName: "upsert" | "delete",
): Promise<void> {
  let attempt = 1;
  let lastErrorMessage = "unknown error";

  while (attempt <= VAULT_SYNC_MAX_ATTEMPTS) {
    const error = await operation();

    if (!error) {
      return;
    }

    lastErrorMessage = error.message;
    const shouldRetry = isRetryableVaultSyncError(lastErrorMessage);
    const hasNextAttempt = attempt < VAULT_SYNC_MAX_ATTEMPTS;

    if (!shouldRetry || !hasNextAttempt) {
      throw new Error(`Failed to ${operationName} vault metadata: ${lastErrorMessage}`);
    }

    const retryDelay = VAULT_SYNC_BASE_DELAY_MS * 2 ** (attempt - 1);
    await sleep(retryDelay);
    attempt += 1;
  }
}

function isRetryableVaultSyncError(message: string): boolean {
  const normalizedMessage = message.toLowerCase();

  return normalizedMessage.includes("timeout")
    || normalizedMessage.includes("timed out")
    || normalizedMessage.includes("network")
    || normalizedMessage.includes("connection")
    || normalizedMessage.includes("temporar")
    || normalizedMessage.includes("rate limit")
    || normalizedMessage.includes("too many requests")
    || normalizedMessage.includes("service unavailable")
    || normalizedMessage.includes("deadlock")
    || normalizedMessage.includes("could not serialize");
}

async function sleep(durationMs: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function getFileNameFromPath(path: string): string {
  const segments = path.split("/").filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? path;
}

function deriveTitleFromFilename(filename: string): string {
  const withoutExtension = filename.replace(/\.[^/.]+$/, "");
  const normalized = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "file";
}
