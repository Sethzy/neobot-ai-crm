/**
 * Browser approval endpoint for Managed Agents tool confirmations.
 *
 * This route records the user's decision, resumes the paused managed-agent
 * session in the background, and returns immediately. The Anthropic webhook
 * remains the safety net if background continuation is interrupted.
 *
 * @module app/api/tool-confirm/route
 */
import { after } from "next/server";
import { z } from "zod";

import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { resumeManagedAgentFromApproval } from "@/lib/managed-agents/adapter";
import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";

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
  const parsedBody = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return jsonError("Invalid request body.", 400);
  }

  const auth = await authenticateRequest();
  if (auth.kind === "error") {
    return auth.response;
  }

  const clientId = await resolveClientId(auth.supabase, auth.userId);
  const anthropic = getAnthropicClient();

  const result = await resumeManagedAgentFromApproval({
    anthropic,
    supabase: auth.supabase,
    clientId,
    approvalId: parsedBody.data.approvalId,
    approved: parsedBody.data.approved,
    denyMessage: parsedBody.data.denyMessage,
  });

  if (result.status === "missing") {
    return jsonError("Approval not found.", 404);
  }

  if (result.status === "error") {
    return jsonError(result.error, 500);
  }

  const resolvedApproved = result.status === "already_resolved"
    ? result.approved
    : parsedBody.data.approved;
  const responseStatus = result.status === "streaming"
    ? "updated"
    : result.status;

  if (result.status === "streaming") {
    after(() => drainStream(result.stream));
  }

  await captureServerEvent({
    distinctId: clientId,
    event: "approval_resolved",
    properties: {
      approval_id: parsedBody.data.approvalId,
      outcome: resolvedApproved ? "approved" : "denied",
      source: "web",
      status: responseStatus,
    },
  });

  return Response.json({
    success: true,
    status: responseStatus,
    approved: resolvedApproved,
  });
}
