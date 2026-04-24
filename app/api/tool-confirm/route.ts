/**
 * Browser approval endpoint for Managed Agents tool confirmations.
 *
 * This route records the user's decision, resumes the paused managed-agent
 * session in the background, and returns immediately. The Anthropic webhook
 * remains the safety net if background continuation is interrupted.
 *
 * @module app/api/tool-confirm/route
 */
import { z } from "zod";

import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { authenticateAndParseBody, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { resumeManagedAgentFromApproval } from "@/lib/managed-agents/adapter";
import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";
import { runAfter } from "@/lib/server/run-after";

// Approval IDs are Anthropic `tool_use` ids (`tu_*` / `toolu_*` shapes), not
// UUIDs — the session runner stores the tool_use_id directly in
// approval_events.approval_id. Accept any non-empty string and let the DB
// lookup enforce existence.
const requestSchema = z.object({
  approvalId: z.string().min(1),
  approved: z.boolean(),
  denyMessage: z.string().max(500).optional(),
});

async function drainStream(stream: ReadableStream<unknown>): Promise<void> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done } = await reader.read();
      if (done) {
        return;
      }
    }
  } catch (error) {
    console.error("[tool-confirm] drain failed:", error);
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request): Promise<Response> {
  const requestResult = await authenticateAndParseBody(request, requestSchema);
  if (requestResult.kind === "error") {
    return requestResult.response;
  }

  const clientId = await resolveClientId(requestResult.supabase, requestResult.userId);
  const anthropic = getAnthropicClient();

  const approvalResult = await resumeManagedAgentFromApproval({
    anthropic,
    supabase: requestResult.supabase,
    clientId,
    approvalId: requestResult.body.approvalId,
    approved: requestResult.body.approved,
    denyMessage: requestResult.body.denyMessage,
  });

  if (approvalResult.status === "missing") {
    return jsonError("Approval not found.", 404);
  }

  if (approvalResult.status === "error") {
    return jsonError(approvalResult.error, 500);
  }

  const resolvedApproved = approvalResult.status === "already_resolved"
    ? approvalResult.approved
    : requestResult.body.approved;
  const responseStatus = approvalResult.status === "streaming"
    ? "updated"
    : approvalResult.status;

  if (approvalResult.status === "streaming") {
    runAfter(() => drainStream(approvalResult.stream));
  }

  runAfter(() =>
    Promise.resolve(captureServerEvent({
      distinctId: clientId,
      event: "approval_resolved",
      properties: {
        approval_id: requestResult.body.approvalId,
        outcome: resolvedApproved ? "approved" : "denied",
        source: "web",
        status: responseStatus,
      },
    })).catch((error) => {
      console.error("[tool-confirm] Failed to capture approval telemetry.", error);
    }),
  );

  return Response.json({
    success: true,
    status: responseStatus,
    approved: resolvedApproved,
  });
}
