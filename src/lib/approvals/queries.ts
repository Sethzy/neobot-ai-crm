/**
 * Data-access helpers for approval event persistence.
 * @module lib/approvals/queries
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database";

type ApprovalSupabaseClient = SupabaseClient<Database>;

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
    return { success: false as const, error: error.message };
  }

  return { success: true as const, event: data };
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
      status: input.approved ? "approved" : "denied",
      resolved_at: new Date().toISOString(),
    })
    .eq("client_id", input.clientId)
    .eq("approval_id", input.approvalId)
    .eq("status", "pending")
    .select()
    .maybeSingle();

  if (error) {
    return { success: false as const, error: error.message };
  }

  return { success: true as const, event: data };
}

/**
 * Returns the current number of pending approvals for the client.
 */
export async function getPendingApprovalCount(
  supabase: ApprovalSupabaseClient,
  clientId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("approval_events")
    .select("*", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("status", "pending");

  if (error) {
    return 0;
  }

  return count ?? 0;
}
