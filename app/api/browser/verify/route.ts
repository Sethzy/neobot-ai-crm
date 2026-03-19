/**
 * Verifies a Browser-Use auth session and persists the profile mapping.
 * @module app/api/browser/verify/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { getBrowserUseClient } from "@/lib/browser-use/client";
import { upsertProfile } from "@/lib/browser-use/profiles";
import { resolveClientId } from "@/lib/chat/client-id";

const requestSchema = z.object({
  sessionId: z.string().min(1),
  browserUseProfileId: z.string().min(1),
  platform: z.string().trim().min(1).transform((value) => value.toLowerCase()),
  label: z.string().trim().min(1).optional(),
});

const verifyOutputSchema = z.object({
  loggedIn: z.boolean(),
});

const verifyOutputJsonSchema = JSON.stringify({
  type: "object",
  properties: {
    loggedIn: {
      type: "boolean",
      description: "True when the user is logged into the current platform.",
    },
  },
  required: ["loggedIn"],
});

function parseLoggedInOutput(output: unknown): boolean {
  if (typeof output === "string") {
    try {
      return verifyOutputSchema.parse(JSON.parse(output)).loggedIn;
    } catch {
      return false;
    }
  }

  try {
    return verifyOutputSchema.parse(output).loggedIn;
  } catch {
    return false;
  }
}

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
    const client = getBrowserUseClient();
    const task = await client.tasks.create({
      sessionId: body.sessionId,
      llm: "browser-use-llm",
      maxSteps: 5,
      task:
        "Check whether the current browser session is logged into the current platform. " +
        "Return loggedIn=true only if the page clearly shows authenticated account access. " +
        "Return loggedIn=false if you see a login screen, sign-in prompt, or cannot verify access.",
      structuredOutput: verifyOutputJsonSchema,
    });

    const result = await client.tasks.wait(task.id);

    try {
      await client.sessions.stop(body.sessionId);
    } catch {
      // Session cleanup failures should not mask the verification result.
    }

    const isLoggedIn = result.isSuccess === true && parseLoggedInOutput(result.output);
    if (!isLoggedIn) {
      return Response.json({
        success: false,
        error: "Login could not be verified. Please try logging in again.",
      });
    }

    const profile = await upsertProfile(supabase, {
      clientId,
      platform: body.platform,
      browserUseProfileId: body.browserUseProfileId,
      label: body.label ?? body.platform,
    });

    return Response.json({
      success: true,
      platform: body.platform,
      label: profile.label,
    });
  } catch (error) {
    console.error("[browser/verify] Failed to verify auth session.", error);
    return jsonError("Failed to verify browser session.", 500);
  }
}
