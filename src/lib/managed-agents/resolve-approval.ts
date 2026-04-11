/**
 * Shared approval resolver for browser + Telegram approval flows.
 * @module lib/managed-agents/resolve-approval
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";
import type { Database } from "@/types/database";

const DEFAULT_DENY_MESSAGE = "User denied this action.";

type ResolveSupabase = SupabaseClient<Database>;

export interface ResolveApprovalInput {
  clientId: string;
  approvalId: string;
  approved: boolean;
  denyMessage?: string;
}

export type ResolveApprovalResult =
  | { success: true; status: "updated" | "already_resolved"; threadId: string }
  | { success: false; status: "missing" | "error"; error?: string };

/**
 * Resolves a persisted approval UUID into the originating Anthropic session
 * and forwards a `user.tool_confirmation` event back to that session.
 */
export async function resolveApprovalById(
  supabase: ResolveSupabase,
  input: ResolveApprovalInput,
): Promise<ResolveApprovalResult> {
  const { data: event, error } = await supabase
    .from("approval_events")
    .select("session_id, tool_use_id, thread_id, client_id, status")
    .eq("approval_id", input.approvalId)
    .eq("client_id", input.clientId)
    .single();

  if (error || !event) {
    return { success: false, status: "missing", error: error?.message };
  }

  if (event.status !== "pending") {
    return {
      success: true,
      status: "already_resolved",
      threadId: event.thread_id,
    };
  }

  if (!event.session_id || !event.tool_use_id) {
    return {
      success: false,
      status: "error",
      error: "Approval event is missing session_id or tool_use_id.",
    };
  }

  const anthropic = getAnthropicClient();
  await anthropic.beta.sessions.events.send(event.session_id, {
    events: [
      input.approved
        ? {
            type: "user.tool_confirmation",
            tool_use_id: event.tool_use_id,
            result: "allow",
          }
        : {
            type: "user.tool_confirmation",
            tool_use_id: event.tool_use_id,
            result: "deny",
            deny_message: input.denyMessage ?? DEFAULT_DENY_MESSAGE,
          },
    ],
  } as never);

  const { error: updateError } = await supabase
    .from("approval_events")
    .update({
      status: input.approved ? "approved" : "denied",
      resolved_at: new Date().toISOString(),
    })
    .eq("approval_id", input.approvalId)
    .eq("client_id", input.clientId)
    .eq("status", "pending");

  if (updateError) {
    return { success: false, status: "error", error: updateError.message };
  }

  return {
    success: true,
    status: "updated",
    threadId: event.thread_id,
  };
}
