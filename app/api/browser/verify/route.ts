/**
 * Verifies a Browser-Use auth session and persists the profile mapping.
 * @module app/api/browser/verify/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { verifyBrowserAuthToken } from "@/lib/browser-use/auth-state";
import { getBrowserUseClient } from "@/lib/browser-use/client";
import { upsertProfile } from "@/lib/browser-use/profiles";
import { resolveClientId } from "@/lib/chat/client-id";

const requestSchema = z.object({
  authToken: z.string().min(1),
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

  const token = verifyBrowserAuthToken(body.authToken);
  if (!token) {
    return jsonError("Invalid browser auth state.", 400);
  }

  try {
    const clientId = await resolveClientId(supabase, userId);
    if (clientId !== token.clientId) {
      return jsonError("Invalid browser auth state.", 400);
    }

    const client = getBrowserUseClient();
    try {
      const task = await client.tasks.create({
        sessionId: token.sessionId,
        llm: "browser-use-llm",
        maxSteps: 5,
        task:
          "Check whether the current browser session is logged into the current platform. " +
          "Return loggedIn=true only if the page clearly shows authenticated account access. " +
          "Return loggedIn=false if you see a login screen, sign-in prompt, or cannot verify access.",
        structuredOutput: verifyOutputJsonSchema,
      });

      const result = await client.tasks.wait(task.id);

      const isLoggedIn = result.isSuccess === true && parseLoggedInOutput(result.output);
      if (!isLoggedIn) {
        return Response.json({
          success: false,
          error: "Login could not be verified. Please try logging in again.",
        });
      }

      const profile = await upsertProfile(supabase, {
        clientId,
        platform: token.platform,
        browserUseProfileId: token.browserUseProfileId,
        label: token.platform,
      });

      return Response.json({
        success: true,
        platform: token.platform,
        label: profile.label,
      });
    } finally {
      try {
        await client.sessions.stop(token.sessionId);
      } catch {
        // Session cleanup failures should not mask the verification result.
      }
    }
  } catch (error) {
    console.error("[browser/verify] Failed to verify auth session.", error);
    return jsonError("Failed to verify browser session.", 500);
  }
}
