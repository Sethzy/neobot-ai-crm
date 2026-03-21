/**
 * Shared server-side approval continuation used by Telegram callbacks.
 * @module lib/approvals/continue-after-approval
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveApprovalEvent } from "@/lib/approvals/queries";
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

  if (input.approved) {
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
  }

  return { success: true, status: "continued" };
}
