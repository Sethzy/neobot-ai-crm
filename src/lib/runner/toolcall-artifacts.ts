/**
 * Helpers for persisting oversized tool outputs outside the conversation message row.
 * @module lib/runner/toolcall-artifacts
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { ARTIFACT_SIZE_THRESHOLD_BYTES } from "@/lib/runner/compaction";
import type { PersistedPart } from "@/lib/runner/message-utils";
import type { Database } from "@/types/database";

const AGENT_FILES_BUCKET_ID = "agent-files";

type ChatSupabaseClient = SupabaseClient<Database>;

export interface TruncateOversizedPartsResult {
  parts: PersistedPart[];
  recoveryPaths: string[];
}

function getSerializedArtifact(output: unknown): string | null {
  if (output == null) {
    return null;
  }

  if (typeof output === "string") {
    return output;
  }

  return JSON.stringify(output, null, 2);
}

function getSerializedSizeBytes(output: unknown): number {
  const serialized = getSerializedArtifact(output);
  return serialized == null ? 0 : new TextEncoder().encode(serialized).length;
}

/**
 * Returns true when a tool result should be saved as a separate artifact.
 */
export function shouldTruncateToolResult(output: unknown): boolean {
  if (output == null) {
    return false;
  }

  return getSerializedSizeBytes(output) >= ARTIFACT_SIZE_THRESHOLD_BYTES;
}

/**
 * Produces the inline marker stored in the persisted tool part after truncation.
 * Format matches what `<context-management>` instructions describe to the agent.
 */
export function buildContextRemovedMarker(
  storagePath: string,
  originalSizeBytes: number,
): string {
  const originalKB = Math.round(originalSizeBytes / 1024);
  const thresholdKB = Math.round(ARTIFACT_SIZE_THRESHOLD_BYTES / 1024);
  return `<context-removed>Data truncated: ${originalKB}KB -> ${thresholdKB}KB. path: ${storagePath}</context-removed>`;
}

/**
 * Stores both the tool call arguments and result to the tenant workspace.
 * Called for EVERY tool call regardless of size — matches Tasklet's block storage pattern
 * where all tool data is always recoverable from storage.
 *
 * Skips upload for nullish args or result individually.
 * If both are nullish, does nothing.
 */
export async function saveToolcallBlock(
  supabase: ChatSupabaseClient,
  clientId: string,
  toolCallId: string,
  args: unknown,
  result: unknown,
): Promise<void> {
  const uploads: Promise<void>[] = [];

  const argsContent = getSerializedArtifact(args);
  if (argsContent != null) {
    uploads.push(
      supabase.storage
        .from(AGENT_FILES_BUCKET_ID)
        .upload(
          `${clientId}/toolcalls/${toolCallId}/args.json`,
          argsContent,
          { upsert: true, contentType: "application/json; charset=utf-8" },
        )
        .then(({ error }) => {
          if (error) throw new Error(error.message);
        }),
    );
  }

  const resultContent = getSerializedArtifact(result);
  if (resultContent != null) {
    uploads.push(
      supabase.storage
        .from(AGENT_FILES_BUCKET_ID)
        .upload(
          `${clientId}/toolcalls/${toolCallId}/result.json`,
          resultContent,
          { upsert: true, contentType: "application/json; charset=utf-8" },
        )
        .then(({ error }) => {
          if (error) throw new Error(error.message);
        }),
    );
  }

  await Promise.all(uploads);
}

/**
 * Saves a full tool result to the tenant workspace and returns the workspace-relative recovery path.
 */
export async function saveToolcallArtifact(
  supabase: ChatSupabaseClient,
  clientId: string,
  toolCallId: string,
  output: unknown,
): Promise<string> {
  const artifactContent = getSerializedArtifact(output);
  if (artifactContent == null) {
    throw new Error("Cannot save an empty toolcall artifact.");
  }

  const workspacePath = `toolcalls/${toolCallId}/result.json`;
  const storagePath = `${clientId}/${workspacePath}`;
  const { error } = await supabase.storage.from(AGENT_FILES_BUCKET_ID).upload(
    storagePath,
    artifactContent,
    {
      upsert: true,
      contentType: "application/json; charset=utf-8",
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return workspacePath;
}

/**
 * Replaces oversized tool outputs with recovery markers and reports which artifacts were created.
 */
export async function truncateOversizedParts(
  supabase: ChatSupabaseClient,
  clientId: string,
  parts: ReadonlyArray<PersistedPart>,
): Promise<TruncateOversizedPartsResult> {
  const truncatedParts = await Promise.all(parts.map(async (part) => {
    if (
      part.state !== "output-available" ||
      typeof part.toolCallId !== "string" ||
      !Object.prototype.hasOwnProperty.call(part, "output")
    ) {
      return part;
    }

    const output = part.output;
    if (!shouldTruncateToolResult(output)) {
      return part;
    }

    const serialized = getSerializedArtifact(output) ?? "";
    const originalSizeBytes = new TextEncoder().encode(serialized).length;
    const recoveryPath = await saveToolcallArtifact(
      supabase,
      clientId,
      part.toolCallId,
      output,
    );

    const head = serialized.slice(0, ARTIFACT_SIZE_THRESHOLD_BYTES);
    const marker = buildContextRemovedMarker(recoveryPath, originalSizeBytes);

    return {
      ...part,
      output: `${head}\n\n${marker}`,
      recoveryPath,
    };
  }));

  const recoveryPaths = truncatedParts
    .filter(
      (part): part is PersistedPart & { recoveryPath: string } =>
        typeof part.recoveryPath === "string",
    )
    .map((part) => part.recoveryPath);

  return {
    parts: truncatedParts.map((part) => (
      typeof part.recoveryPath !== "string"
        ? part
        : Object.fromEntries(
          Object.entries(part).filter(([key]) => key !== "recoveryPath"),
        )
    )),
    recoveryPaths,
  };
}
