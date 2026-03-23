/**
 * Block storage for tool call args and results (observability/recovery).
 * Extracted from toolcall-artifacts.ts — truncation functions removed.
 * @module lib/storage/tool-blocks
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const AGENT_FILES_BUCKET_ID = "agent-files";

type ChatSupabaseClient = SupabaseClient<Database>;

/** Serializes tool output to a string for storage. Returns null for nullish input. */
export function serializeToolOutput(output: unknown): string | null {
  if (output == null) return null;
  if (typeof output === "string") return output;
  return JSON.stringify(output, null, 2);
}

/**
 * Stores both the tool call arguments and result to the tenant workspace.
 * Called for observability and subagent block persistence.
 */
export async function saveToolcallBlock(
  supabase: ChatSupabaseClient,
  clientId: string,
  toolCallId: string,
  args: unknown,
  result: unknown,
): Promise<void> {
  const uploads: Promise<void>[] = [];

  const argsContent = serializeToolOutput(args);
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

  const resultContent = serializeToolOutput(result);
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
