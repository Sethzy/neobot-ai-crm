/**
 * DELETE /api/telegram/disconnect
 * Removes the authenticated client's Telegram channel mapping.
 * @module app/api/telegram/disconnect/route
 */
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { clearPendingQuestionsForChat } from "@/lib/channels/telegram/pending-questions";
import { resolveClientId } from "@/lib/chat/client-id";
import { createAdminClient } from "@/lib/supabase/server";

export async function DELETE(): Promise<Response> {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") {
    return authResult.response;
  }

  try {
    const clientId = await resolveClientId(authResult.supabase, authResult.userId);
    const { data: mapping } = await authResult.supabase
      .from("conversation_channel_mappings")
      .select("external_conversation_id")
      .eq("channel", "telegram")
      .eq("client_id", clientId)
      .maybeSingle();
    const { error } = await authResult.supabase
      .from("conversation_channel_mappings")
      .delete()
      .eq("channel", "telegram")
      .eq("client_id", clientId);

    if (error) {
      console.error("[telegram/disconnect] Failed to delete mapping:", error);
      return jsonError("Failed to disconnect Telegram.", 500);
    }

    if (mapping?.external_conversation_id) {
      const adminSupabase = await createAdminClient();
      await clearPendingQuestionsForChat(adminSupabase, mapping.external_conversation_id);
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("[telegram/disconnect] Unexpected failure:", error);
    return jsonError("Failed to disconnect Telegram.", 500);
  }
}
