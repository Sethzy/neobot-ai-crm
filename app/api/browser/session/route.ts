/**
 * Creates or resumes a Browser-Use session for platform authentication.
 * @module app/api/browser/session/route
 */
import { z } from "zod";

import { authenticateAndParseBody, jsonError } from "@/lib/api/route-helpers";
import { createBrowserAuthToken } from "@/lib/browser-use/auth-state";
import { getBrowserUseClient } from "@/lib/browser-use/client";
import { getProfileForPlatform } from "@/lib/browser-use/profiles";
import { getBrowserPlatformConfig } from "@/lib/browser-use/platforms";
import { resolveClientId } from "@/lib/chat/client-id";

const requestSchema = z.object({
  platform: z.string().trim().min(1).transform((value) => value.toLowerCase()),
  startUrl: z.string().url().optional(),
});

export async function POST(request: Request): Promise<Response> {
  const requestResult = await authenticateAndParseBody(request, requestSchema);
  if (requestResult.kind === "error") {
    return requestResult.response;
  }

  try {
    const clientId = await resolveClientId(requestResult.supabase, requestResult.userId);
    const platformConfig = getBrowserPlatformConfig(requestResult.body.platform);
    const existingProfile = await getProfileForPlatform(
      requestResult.supabase,
      clientId,
      platformConfig.slug,
    );
    const client = getBrowserUseClient();

    const browserUseProfileId = existingProfile
      ? existingProfile.browser_use_profile_id
      : (await client.profiles.create({
        name: `sunder_${clientId}_${platformConfig.slug}`,
      })).id;

    const session = await client.sessions.create({
      profileId: browserUseProfileId,
      ...(requestResult.body.startUrl ?? platformConfig.startUrl
        ? { startUrl: requestResult.body.startUrl ?? platformConfig.startUrl }
        : {}),
    });

    return Response.json({
      sessionId: session.id,
      liveUrl: session.liveUrl,
      authToken: createBrowserAuthToken({
        clientId,
        platform: platformConfig.slug,
        sessionId: session.id,
        browserUseProfileId,
      }),
      platform: platformConfig.slug,
    });
  } catch (error) {
    console.error("[browser/session] Failed to create auth session.", error);
    return jsonError("Failed to create browser session.", 500);
  }
}
