/**
 * Shared server-side approval continuation used by Telegram callbacks.
 * @module lib/approvals/continue-after-approval
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { patchApprovalPartState, resolveApprovalEvent } from "@/lib/approvals/queries";
import { runAgent } from "@/lib/runner/run-agent";
import type { Database } from "@/types/database";

interface ResolveAndContinueInput {
  clientId: string;
  threadId: string;
  approvalId: string;
  approved: boolean;
}

interface ResolveAndContinueResult {
  success: boolean;
  status: string;
}

/**
 * Resolves a pending approval and optionally starts the next runner turn.
 * Approval continuations use empty input, match chat-route semantics, and do
 * not consume message quota because no new user message was sent.
 */
export async function resolveAndContinueApproval(
  supabase: SupabaseClient<Database>,
  input: ResolveAndContinueInput,
): Promise<ResolveAndContinueResult> {
  const result = await resolveApprovalEvent(supabase, {
    clientId: input.clientId,
    approvalId: input.approvalId,
    approved: input.approved,
  });

  if (!result.success) {
    return { success: false, status: result.status };
  }

  if (result.status === "already_resolved") {
    return { success: true, status: "already_resolved" };
  }

  // Patch the tool call part state in conversation_messages so the runner
  // sees approval-responded (not stale approval-requested) on reload.
  // Uses the DB-authoritative outcome from resolveApprovalEvent.
  const approvedFromDb = result.success && "event" in result && result.event?.status === "approved";
  await patchApprovalPartState(supabase, {
    threadId: input.threadId,
    approvalId: input.approvalId,
    approved: approvedFromDb,
  });

  // Continue the run for both approve and deny so the model sees the result
  // and can respond naturally (acknowledge denial or use approved tools).
  const agentResult = await runAgent(
    {
      clientId: input.clientId,
      threadId: input.threadId,
      triggerType: "chat",
      input: "",
      channel: "telegram",
      consumeMessageQuota: false,
    },
    supabase,
  );

  if (agentResult.status === "streaming") {
    await agentResult.streamResult.text;
  }

  return { success: true, status: "continued" };
}
