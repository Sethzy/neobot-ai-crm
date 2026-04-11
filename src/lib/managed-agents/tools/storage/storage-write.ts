/**
 * storage_write tool for managed agents.
 *
 * @module lib/managed-agents/tools/storage/storage-write
 */
import { z } from "zod";

import type { ManagedAgentTool } from "../types";
import {
  captureMemoryWriteEvent,
  getStorageFileClient,
  resolveStorageWritePath,
} from "./shared";

const inputSchema = z.object({
  op: z.enum(["write", "edit", "delete"]).describe("The operation type"),
  path: z.string().describe(
    "Absolute path to the file (for example '/agent/memory/topic.md' or '/agent/home/notes.md').",
  ),
  content: z
    .string()
    .optional()
    .describe("File content, overwrites existing content (required for write op)"),
  old_string: z
    .string()
    .min(1)
    .optional()
    .describe("Exact text to find and replace in the file (required for edit op)"),
  new_string: z
    .string()
    .optional()
    .describe("Replacement text, can be empty to delete old_string (required for edit op)"),
  replace_all: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, replace all occurrences. If false (default), fails on multiple matches."),
});

type StorageWriteInput = z.infer<typeof inputSchema>;

export const storageWriteTool: ManagedAgentTool<StorageWriteInput> = {
  name: "storage_write",
  description:
    "Creates, edits, or deletes a file in the filesystem. Supports three operations: write (create or overwrite), edit (find and replace text), and delete.",
  inputSchema,
  execute: async ({ op, path, content, old_string, new_string, replace_all }, context) => {
    const fileClient = getStorageFileClient(context);
    const { normalizedPath, modelPath, pathKind } = resolveStorageWritePath(path);
    const shouldReplaceAll = replace_all ?? false;

    switch (op) {
      case "write": {
        if (content === undefined) {
          throw new Error("write op requires content.");
        }

        await fileClient.uploadFile(normalizedPath, content);
        await captureMemoryWriteEvent({
          clientId: context.clientId,
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
          clientId: context.clientId,
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
};
