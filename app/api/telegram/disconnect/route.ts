/**
 * DELETE /api/telegram/disconnect
 * Removes the authenticated user's Telegram connection.
 * @module app/api/telegram/disconnect/route
 */
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { clearPendingQuestionsForChat } from "@/lib/channels/telegram/pending-questions";
import {
  deleteTelegramChannelMapping,
  deleteTelegramConnectionForUser,
  getTelegramConnectionForUser,
} from "@/lib/channels/telegram/user-connections";
import { createAdminClient } from "@/lib/supabase/server";

export async function DELETE(): Promise<Response> {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") {
    return authResult.response;
  }

  try {
    const connection = await getTelegramConnectionForUser(authResult.supabase, authResult.userId);

    if (connection) {
      const adminSupabase = await createAdminClient();
      await clearPendingQuestionsForChat(adminSupabase, connection.externalConversationId);
      await deleteTelegramChannelMapping(adminSupabase, {
        chatId: connection.externalConversationId,
        clientId: connection.clientId,
      });
    }

    await deleteTelegramConnectionForUser(authResult.supabase, authResult.userId);

    return Response.json({ success: true });
  } catch (error) {
    console.error("[telegram/disconnect] Unexpected failure:", error);
    return jsonError("Failed to disconnect Telegram.", 500);
  }
}
