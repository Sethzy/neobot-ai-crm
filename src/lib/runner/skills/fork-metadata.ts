/**
 * Helpers for the `_fork.json` sidecar that accompanies a user-duplicated
 * skill bundle in storage.
 *
 * @module lib/runner/skills/fork-metadata
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AGENT_FILES_BUCKET,
  AGENT_FILES_TEXT_CONTENT_TYPE,
} from "@/lib/storage/agent-files";

export interface ForkMetadata {
  /** Anthropic `latest_version` captured when the fork was created or acknowledged. */
  forkedFromVersion: string;
  /** ISO timestamp for when the fork metadata was last written. */
  forkedAt: string;
}

export function forkMetadataPath(clientId: string, slug: string): string {
  return `${clientId}/skills/${slug}/_fork.json`;
}

export async function readForkMetadata(
  supabase: SupabaseClient,
  clientId: string,
  slug: string,
): Promise<ForkMetadata | null> {
  const storagePath = forkMetadataPath(clientId, slug);
  const { data, error } = await supabase.storage.from(AGENT_FILES_BUCKET).download(storagePath);

  if (error || !data) {
    return null;
  }

  try {
    const raw =
      typeof data === "string"
        ? data
        : typeof (data as { text?: () => Promise<string> }).text === "function"
          ? await (data as { text: () => Promise<string> }).text()
          : typeof (data as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer === "function"
            ? new TextDecoder().decode(
              await (data as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer(),
            )
          : JSON.stringify(data);
    const parsed = JSON.parse(raw) as Partial<ForkMetadata>;

    if (
      typeof parsed.forkedFromVersion !== "string"
      || typeof parsed.forkedAt !== "string"
    ) {
      return null;
    }

    return {
      forkedFromVersion: parsed.forkedFromVersion,
      forkedAt: parsed.forkedAt,
    };
  } catch {
    return null;
  }
}

export async function writeForkMetadata(
  supabase: SupabaseClient,
  clientId: string,
  slug: string,
  metadata: ForkMetadata,
): Promise<void> {
  const storagePath = forkMetadataPath(clientId, slug);
  const { error } = await supabase.storage.from(AGENT_FILES_BUCKET).upload(
    storagePath,
    JSON.stringify(metadata, null, 2),
    {
      upsert: true,
      contentType: AGENT_FILES_TEXT_CONTENT_TYPE,
    },
  );

  if (error) {
    throw new Error(`Failed to write fork metadata for "${slug}": ${error.message}`);
  }
}
