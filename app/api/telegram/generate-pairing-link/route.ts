/**
 * POST /api/telegram/generate-pairing-link
 * Generates a Telegram deep-link pairing URL for the authenticated client.
 * @module app/api/telegram/generate-pairing-link/route
 */
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { getBotUsername } from "@/lib/channels/telegram";
import {
  generatePairingToken,
  PAIRING_TOKEN_TTL_MS,
} from "@/lib/channels/telegram/pairing";
import { resolveClientId } from "@/lib/chat/client-id";

export async function POST(): Promise<Response> {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") {
    return authResult.response;
  }

  try {
    const clientId = await resolveClientId(authResult.supabase, authResult.userId);
    const token = generatePairingToken();
    const expiresAt = new Date(Date.now() + PAIRING_TOKEN_TTL_MS).toISOString();

    const { error: deleteError } = await authResult.supabase
      .from("telegram_pairing_tokens")
      .delete()
      .eq("client_id", clientId);

    if (deleteError) {
      return jsonError("Failed to generate Telegram pairing link.", 500);
    }

    const { error: insertError } = await authResult.supabase
      .from("telegram_pairing_tokens")
      .insert({
        token,
        client_id: clientId,
        expires_at: expiresAt,
      });

    if (insertError) {
      return jsonError("Failed to generate Telegram pairing link.", 500);
    }

    const username = await getBotUsername();
    return Response.json({
      url: `https://t.me/${username}?start=${token}`,
      expiresInSeconds: PAIRING_TOKEN_TTL_MS / 1000,
    });
  } catch (error) {
    console.error("[telegram/pairing-link] Failed to generate link:", error);
    return jsonError("Failed to generate Telegram pairing link.", 500);
  }
}
