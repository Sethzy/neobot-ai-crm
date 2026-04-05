/**
 * Shared audit-log capture helpers for CRM record mutations.
 * @module lib/crm/timeline-capture
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database";

export type TimelineActorType = "user" | "agent" | "system";
export type TimelineRecordType = "contact" | "company" | "deal" | "task";
export type CrmTimelineAction = "created" | "updated" | "deleted";

export interface CaptureTimelineActivityParams {
  supabase: SupabaseClient<Database>;
  clientId: string;
  recordType: TimelineRecordType;
  recordId: string;
  action: CrmTimelineAction;
  actorType: TimelineActorType;
  actorLabel?: string;
  happenedAt?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

type TimelineDiffValue = {
  before: unknown;
  after: unknown;
};

const SKIPPED_DIFF_FIELDS = new Set([
  "client_id",
  "created_at",
  "updated_at",
  "search_vector",
]);

function getDefaultActorLabel(actorType: TimelineActorType) {
  if (actorType === "agent") {
    return "Sunder";
  }

  if (actorType === "system") {
    return "System";
  }

  return null;
}

function isEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Returns the changed fields between two record snapshots.
 */
export function calculateDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, TimelineDiffValue> | null {
  const keys = new Set([
    ...Object.keys(before),
    ...Object.keys(after),
  ]);
  const diff: Record<string, TimelineDiffValue> = {};

  for (const key of keys) {
    if (SKIPPED_DIFF_FIELDS.has(key)) {
      continue;
    }

    const previousValue = before[key];
    const nextValue = after[key];

    if (isEqual(previousValue, nextValue)) {
      continue;
    }

    diff[key] = {
      before: previousValue,
      after: nextValue,
    };
  }

  return Object.keys(diff).length > 0 ? diff : null;
}

/**
 * Best-effort capture for CRM timeline activities.
 * The underlying mutation must never wait on or fail because of audit logging.
 */
export async function captureTimelineActivity({
  supabase,
  clientId,
  recordType,
  recordId,
  action,
  actorType,
  actorLabel,
  happenedAt,
  before,
  after,
}: CaptureTimelineActivityParams): Promise<void> {
  let properties: Record<string, unknown> | null = null;

  if (action === "created") {
    if (!after) {
      return;
    }

    properties = {
      after,
    };
  }

  if (action === "deleted") {
    if (!before) {
      return;
    }

    properties = {
      before,
    };
  }

  if (action === "updated") {
    if (!before || !after) {
      return;
    }

    const diff = calculateDiff(before, after);

    if (!diff) {
      return;
    }

    properties = {
      before,
      after,
      updatedFields: Object.keys(diff),
      diff,
    };
  }

  if (!properties) {
    return;
  }

  try {
    const rpcPromise = supabase.rpc("upsert_timeline_activity", {
      p_client_id: clientId,
      p_record_type: recordType,
      p_record_id: recordId,
      p_name: `${recordType}.${action}`,
      p_properties: properties as Json,
      p_actor_type: actorType,
      p_actor_label: actorLabel ?? getDefaultActorLabel(actorType) ?? "",
      p_happened_at: happenedAt,
    });

    void Promise.resolve(rpcPromise).catch(() => undefined);
  } catch {
    // Swallow synchronous and async capture failures.
  }
}
