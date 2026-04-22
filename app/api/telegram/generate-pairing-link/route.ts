/**
 * POST /api/telegram/generate-pairing-link
 * Generates a Telegram pairing session for the authenticated user.
 * @module app/api/telegram/generate-pairing-link/route
 */
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { getBotUsername } from "@/lib/channels/telegram";
import {
  generatePairingDisplayCode,
  generatePairingToken,
  PAIRING_TOKEN_TTL_MS,
} from "@/lib/channels/telegram/pairing";
import {
  clearTelegramPairingSessionsForUser,
  createTelegramPairingSession,
  findTelegramClientConnectionConflict,
  getTelegramReadiness,
} from "@/lib/channels/telegram/user-connections";
import { resolveClientId } from "@/lib/chat/client-id";
import { getDefaultMessagingThreadForUser } from "@/lib/settings/profile/messaging-preferences";
import type { AuthResult } from "@/lib/api/route-helpers";

type AuthenticatedSupabase = Extract<AuthResult, { kind: "ok" }>["supabase"];

function getPairingLinkErrorResponse(error: unknown): Response {
  if (error instanceof Error && error.message.includes("Telegram pairing is unavailable")) {
    return jsonError(
      error.message,
      503,
    );
  }

  return jsonError("Failed to generate Telegram pairing link.", 500);
}

async function createPairingSessionWithRetry(input: {
  clientId: string;
  expiresAt: string;
  supabase: AuthenticatedSupabase;
  targetThreadId: string;
  userId: string;
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await createTelegramPairingSession(input.supabase, {
        clientId: input.clientId,
        deepLinkToken: generatePairingToken(),
        displayCode: generatePairingDisplayCode(),
        expiresAt: input.expiresAt,
        targetThreadId: input.targetThreadId,
        userId: input.userId,
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.toLowerCase().includes("duplicate")) {
        throw error;
      }
    }
  }

  throw new Error("Failed to generate Telegram pairing link.");
}

export async function POST(): Promise<Response> {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") {
    return authResult.response;
  }

  try {
    const readiness = getTelegramReadiness();
    if (!readiness.isConfigured) {
      throw new Error(
        "Telegram pairing is unavailable because the bot is not configured.",
      );
    }

    const clientId = await resolveClientId(authResult.supabase, authResult.userId);
    const conflictingConnection = await findTelegramClientConnectionConflict(
      authResult.supabase,
      {
        clientId,
        userId: authResult.userId,
      },
    );
    if (conflictingConnection) {
      return jsonError(
        "Telegram is already connected for another user on this workspace.",
        409,
      );
    }

    const targetThreadId = await getDefaultMessagingThreadForUser(authResult.supabase, {
      clientId,
      userId: authResult.userId,
    });
    const username = await getBotUsername();
    const expiresAt = new Date(Date.now() + PAIRING_TOKEN_TTL_MS).toISOString();

    await clearTelegramPairingSessionsForUser(authResult.supabase, authResult.userId);
    const session = await createPairingSessionWithRetry({
      clientId,
      expiresAt,
      supabase: authResult.supabase,
      targetThreadId,
      userId: authResult.userId,
    });

    return Response.json({
      botUsername: username,
      displayCode: session.displayCode,
      expiresInSeconds: PAIRING_TOKEN_TTL_MS / 1000,
      openUrl: `https://t.me/${username}?start=${session.deepLinkToken}`,
    });
  } catch (error) {
    console.error("[telegram/pairing-link] Failed to generate link:", error);
    return getPairingLinkErrorResponse(error);
  }
}
