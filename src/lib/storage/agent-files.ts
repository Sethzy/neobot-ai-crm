/**
 * Client-scoped helper for agent file operations in Supabase Storage.
 * @module lib/storage/agent-files
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET_ID = "agent-files";
const ROOT_SOUL_PATH = "SOUL.md";

/**
 * Normalizes and validates a workspace-relative path.
 *
 * @param inputPath - Relative path supplied by caller.
 * @param allowEmpty - Whether an empty normalized path is allowed.
 */
export function normalizeWorkspacePath(inputPath: string, allowEmpty: boolean): string {
  const withForwardSlashes = inputPath.replaceAll("\\", "/");
  const withoutLeadingSlash = withForwardSlashes.replace(/^\/+/, "");
  const segments = withoutLeadingSlash.split("/").filter((segment) => segment.length > 0);

  if (!allowEmpty && segments.length === 0) {
    throw new Error("Invalid path: path cannot be empty.");
  }

  if (segments.some((segment) => segment === "..")) {
    throw new Error(`Invalid path: "${inputPath}" contains directory traversal.`);
  }

  return segments.join("/");
}

/**
 * Resolves a workspace-relative path into the full bucket path.
 *
 * @param clientId - Tenant identifier used as the root folder prefix.
 * @param inputPath - Relative path inside the client workspace.
 * @param allowEmpty - Whether empty path resolves to the workspace root.
 */
function resolveStoragePath(clientId: string, inputPath: string, allowEmpty = false): string {
  const normalizedPath = normalizeWorkspacePath(inputPath, allowEmpty);
  return normalizedPath.length === 0 ? clientId : `${clientId}/${normalizedPath}`;
}

/**
 * Prevents agent writes to protected root files.
 *
 * @param inputPath - Workspace-relative path.
 */
function assertWritable(inputPath: string): void {
  const normalizedPath = normalizeWorkspacePath(inputPath, false);

  if (normalizedPath === ROOT_SOUL_PATH) {
    throw new Error(`${ROOT_SOUL_PATH} is read-only and cannot be modified by the agent.`);
  }
}

/**
 * Creates a client-scoped file interface over the `agent-files` bucket.
 *
 * @param supabase - Authenticated Supabase client.
 * @param clientId - Tenant identifier used as prefix folder.
 */
export function createAgentFileClient(supabase: SupabaseClient, clientId: string) {
  /**
   * Downloads a text file from the client workspace.
   *
   * @param path - Relative workspace file path.
   */
  async function downloadFile(path: string): Promise<string> {
    const storagePath = resolveStoragePath(clientId, path);
    const { data, error } = await supabase.storage.from(BUCKET_ID).download(storagePath);

    if (error || !data) {
      throw new Error(`Failed to read file "${path}": ${error?.message ?? "unknown error"}`);
    }

    if (typeof data === "string") {
      return data;
    }

    if (typeof (data as { text?: () => Promise<string> }).text === "function") {
      return (data as { text: () => Promise<string> }).text();
    }

    if (typeof (data as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer === "function") {
      const buffer = await (data as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer();
      return new TextDecoder().decode(buffer);
    }

    throw new Error(`Failed to read file "${path}": unsupported response payload.`);
  }

  /**
   * Lists a directory recursively and formats it as an indented tree.
   *
   * @param path - Relative workspace directory path. Empty path means workspace root.
   * @param depth - Current recursion depth.
   */
  async function listDirectory(path: string, depth = 0): Promise<string> {
    const storagePath = resolveStoragePath(clientId, path, true);
    const { data, error } = await supabase.storage.from(BUCKET_ID).list(storagePath, {
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw new Error(`Failed to list directory "${path || "/"}": ${error.message}`);
    }

    if (!data || data.length === 0) {
      return "";
    }

    const files = data
      .filter((item) => item.id !== null)
      .sort((left, right) => left.name.localeCompare(right.name));
    const directories = data
      .filter((item) => item.id === null)
      .sort((left, right) => left.name.localeCompare(right.name));

    const indent = "  ".repeat(depth);
    const lines: string[] = [];

    for (const file of files) {
      lines.push(`${indent}${file.name}`);
    }

    for (const directory of directories) {
      lines.push(`${indent}${directory.name}/`);
      const nextPath = path
        ? `${normalizeWorkspacePath(path, true)}/${directory.name}`
        : directory.name;
      const nested = await listDirectory(nextPath, depth + 1);
      if (nested.length > 0) {
        lines.push(nested);
      }
    }

    return lines.join("\n");
  }

  /**
   * Writes text content to a file (create or overwrite).
   *
   * @param path - Relative workspace file path.
   * @param content - Full text content to store.
   */
  async function uploadFile(path: string, content: string): Promise<void> {
    assertWritable(path);
    const storagePath = resolveStoragePath(clientId, path);

    const { error } = await supabase.storage.from(BUCKET_ID).upload(storagePath, content, {
      upsert: true,
      contentType: "text/plain; charset=utf-8",
    });

    if (error) {
      throw new Error(`Failed to write file "${path}": ${error.message}`);
    }
  }

  /**
   * Edits a file by replacing text and re-uploading the full file.
   *
   * @param path - Relative workspace file path.
   * @param oldString - Text to find.
   * @param newString - Replacement text.
   * @param replaceAll - Whether to replace all matches.
   */
  async function editFile(
    path: string,
    oldString: string,
    newString: string,
    replaceAll = false,
  ): Promise<string> {
    assertWritable(path);

    if (oldString.length === 0) {
      throw new Error("Edit failed: old_string cannot be empty.");
    }

    const existingContent = await downloadFile(path);
    const firstIndex = existingContent.indexOf(oldString);

    if (firstIndex < 0) {
      throw new Error(`Edit failed: "${oldString}" not found in "${path}".`);
    }

    if (!replaceAll) {
      const secondIndex = existingContent.indexOf(oldString, firstIndex + oldString.length);
      if (secondIndex >= 0) {
        throw new Error(
          `Edit failed: "${oldString}" found multiple times in "${path}". Use replace_all to replace all occurrences.`,
        );
      }
    }

    const updatedContent = replaceAll
      ? existingContent.split(oldString).join(newString)
      : existingContent.replace(oldString, newString);

    await uploadFile(path, updatedContent);
    return updatedContent;
  }

  /**
   * Deletes a file from the workspace.
   *
   * @param path - Relative workspace file path.
   */
  async function deleteFile(path: string): Promise<void> {
    assertWritable(path);
    const storagePath = resolveStoragePath(clientId, path);

    const { error } = await supabase.storage.from(BUCKET_ID).remove([storagePath]);
    if (error) {
      throw new Error(`Failed to delete file "${path}": ${error.message}`);
    }
  }

  return {
    downloadFile,
    listDirectory,
    uploadFile,
    editFile,
    deleteFile,
  };
}

/** Public type for the helper API. */
export type AgentFileClient = ReturnType<typeof createAgentFileClient>;
