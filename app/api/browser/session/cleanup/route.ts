/**
 * Cleans up pending Browser-Use auth sessions and any unpersisted first-connect profiles.
 * @module app/api/browser/session/cleanup/route
 */
import { z } from "zod";

import { authenticateAndParseBody, jsonError } from "@/lib/api/route-helpers";
import { verifyBrowserAuthToken } from "@/lib/browser-use/auth-state";
import { getBrowserUseClient } from "@/lib/browser-use/client";
import { getProfileForPlatform } from "@/lib/browser-use/profiles";
import { resolveClientId } from "@/lib/chat/client-id";

const requestSchema = z.object({
  authToken: z.string().min(1),
});

export async function POST(request: Request): Promise<Response> {
  const requestResult = await authenticateAndParseBody(request, requestSchema);
  if (requestResult.kind === "error") {
    return requestResult.response;
  }

  const token = verifyBrowserAuthToken(requestResult.body.authToken);
  if (!token) {
    return jsonError("Invalid browser auth state.", 400);
  }

  try {
    const clientId = await resolveClientId(requestResult.supabase, requestResult.userId);
    if (clientId !== token.clientId) {
      return jsonError("Invalid browser auth state.", 400);
    }

    const client = getBrowserUseClient();
    const persistedProfile = await getProfileForPlatform(
      requestResult.supabase,
      clientId,
      token.platform,
    );

    await Promise.all([
      client.sessions.stop(token.sessionId).catch(() => {
        // Session may already be gone; cleanup should stay best-effort.
      }),
      !persistedProfile
        ? client.profiles.delete(token.browserUseProfileId).catch(() => {
            // Profile cleanup is best-effort; do not fail the client on provider cleanup issues.
          })
        : Promise.resolve(),
    ]);

    return Response.json({ success: true });
  } catch (error) {
    console.error("[browser/session/cleanup] Failed to clean up auth session.", error);
    return jsonError("Failed to clean up browser session.", 500);
  }
}
