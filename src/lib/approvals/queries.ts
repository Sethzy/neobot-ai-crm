/**
 * Data-access helpers for approval event persistence.
 * @module lib/approvals/queries
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database";

type ApprovalSupabaseClient = SupabaseClient<Database>;
type ApprovalEventRow = Database["public"]["Tables"]["approval_events"]["Row"];

/** Mirrors the CHECK constraint in the approval_events migration. */
type ApprovalEventStatus = "pending" | "approved" | "denied" | "expired";

interface CreateApprovalEventInput {
  clientId: string;
  threadId: string;
  runId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  approvalId: string;
}

interface ResolveApprovalEventInput {
  clientId: string;
  approvalId: string;
  approved: boolean;
}

function isDuplicateApprovalEventError(error: { message?: string; code?: string | null } | null) {
  if (!error) {
    return false;
  }

  if (error.code === "23505") {
    return true;
  }

  return error.message?.toLowerCase().includes("duplicate") ?? false;
}

/**
 * Inserts a new pending approval event for an approval-gated tool call.
 */
export async function createApprovalEvent(
  supabase: ApprovalSupabaseClient,
  input: CreateApprovalEventInput,
) {
  const { data, error } = await supabase
    .from("approval_events")
    .insert({
      client_id: input.clientId,
      thread_id: input.threadId,
      run_id: input.runId,
      tool_name: input.toolName,
      tool_input: input.toolInput as Json,
      approval_id: input.approvalId,
    })
    .select()
    .single();

  if (error) {
    if (isDuplicateApprovalEventError(error)) {
      return { success: true as const, status: "duplicate" as const, event: null };
    }

    return { success: false as const, status: "error" as const, error: error.message };
  }

  return { success: true as const, status: "created" as const, event: data };
}

/**
 * Marks an existing approval event as approved or denied once the user responds.
 */
export async function resolveApprovalEvent(
  supabase: ApprovalSupabaseClient,
  input: ResolveApprovalEventInput,
) {
  const { data, error } = await supabase
    .from("approval_events")
    .update({
      status: (input.approved ? "approved" : "denied") satisfies ApprovalEventStatus,
      resolved_at: new Date().toISOString(),
    })
    .eq("client_id", input.clientId)
    .eq("approval_id", input.approvalId)
    .eq("status", "pending")
    .select()
    .maybeSingle();

  if (error) {
    return { success: false as const, status: "error" as const, error: error.message };
  }

  if (data) {
    return { success: true as const, status: "updated" as const, event: data };
  }

  const { data: existingEvent, error: existingEventError } = await supabase
    .from("approval_events")
    .select("status")
    .eq("client_id", input.clientId)
    .eq("approval_id", input.approvalId)
    .maybeSingle();

  if (existingEventError) {
    return {
      success: false as const,
      status: "error" as const,
      error: existingEventError.message,
    };
  }

  if (existingEvent && existingEvent.status !== "pending") {
    return {
      success: true as const,
      status: "already_resolved" as const,
      event: existingEvent,
    };
  }

  return {
    success: false as const,
    status: "missing" as const,
    error: "Approval event not found.",
  };
}
