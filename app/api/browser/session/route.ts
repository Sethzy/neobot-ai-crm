/**
 * Creates or resumes a Browser-Use session for platform authentication.
 * @module app/api/browser/session/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
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
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") {
    return authResult.response;
  }

  const { supabase, userId } = authResult;

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  try {
    const clientId = await resolveClientId(supabase, userId);
    const platformConfig = getBrowserPlatformConfig(body.platform);
    const existingProfile = await getProfileForPlatform(supabase, clientId, platformConfig.slug);
    const client = getBrowserUseClient();

    const browserUseProfileId = existingProfile
      ? existingProfile.browser_use_profile_id
      : (await client.profiles.create({
        name: `sunder_${clientId}_${platformConfig.slug}`,
      })).id;

    const session = await client.sessions.create({
      profileId: browserUseProfileId,
      ...(body.startUrl ?? platformConfig.startUrl
        ? { startUrl: body.startUrl ?? platformConfig.startUrl }
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
