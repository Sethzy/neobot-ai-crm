/**
 * Browser approval endpoint for Managed Agents tool confirmations.
 * @module app/api/tool-confirm/route
 */
import { z } from "zod";

import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { resolveApprovalById } from "@/lib/managed-agents/resolve-approval";

const requestSchema = z.object({
  approvalId: z.string().uuid(),
  approved: z.boolean(),
  denyMessage: z.string().max(500).optional(),
});

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
  const result = await resolveApprovalById(auth.supabase, {
    clientId,
    approvalId: parsedBody.data.approvalId,
    approved: parsedBody.data.approved,
    denyMessage: parsedBody.data.denyMessage,
  });

  if (!result.success) {
    if (result.status === "missing") {
      return jsonError("Approval not found.", 404);
    }

    return jsonError(result.error ?? "Failed to resolve approval.", 500);
  }

  await captureServerEvent({
    distinctId: clientId,
    event: "approval_resolved",
    properties: {
      approval_id: parsedBody.data.approvalId,
      outcome: parsedBody.data.approved ? "approved" : "denied",
      source: "web",
      status: result.status,
    },
  });

  return Response.json({
    success: true,
    status: result.status,
  });
}
