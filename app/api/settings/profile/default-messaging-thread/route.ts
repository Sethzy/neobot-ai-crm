/**
 * GET + PUT the authenticated user's default messaging thread.
 * @module app/api/settings/profile/default-messaging-thread/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import {
  getTelegramConnectionForUser,
  updateTelegramConnectionTargetThread,
  upsertTelegramChannelMapping,
} from "@/lib/channels/telegram/user-connections";
import { resolveClientId } from "@/lib/chat/client-id";
import {
  getDefaultMessagingThreadForUser,
  listAvailableMessagingThreads,
  saveDefaultMessagingThreadForUser,
} from "@/lib/settings/profile/messaging-preferences";
import { createAdminClient } from "@/lib/supabase/server";

const putBodySchema = z.object({
  threadId: z.string().uuid(),
});

export async function GET(): Promise<Response> {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") {
    return authResult.response;
  }

  try {
    const clientId = await resolveClientId(authResult.supabase, authResult.userId);
    const [defaultThreadId, threads] = await Promise.all([
      getDefaultMessagingThreadForUser(authResult.supabase, {
        clientId,
        userId: authResult.userId,
      }),
      listAvailableMessagingThreads(authResult.supabase, clientId),
    ]);

    return Response.json({
      defaultThreadId,
      threads,
    });
  } catch (error) {
    console.error("[settings/profile/default-messaging-thread] Failed to load:", error);
    return jsonError("Failed to load messaging preference.", 500);
  }
}

export async function PUT(request: Request): Promise<Response> {
  let body: z.infer<typeof putBodySchema>;
  try {
    body = putBodySchema.parse(await request.json());
  } catch {
    return jsonError("Invalid request body. threadId must be a UUID.", 400);
  }

  const authResult = await authenticateRequest();
  if (authResult.kind === "error") {
    return authResult.response;
  }

  try {
    const clientId = await resolveClientId(authResult.supabase, authResult.userId);
    const availableThreads = await listAvailableMessagingThreads(authResult.supabase, clientId);
    const selectedThread = availableThreads.find((thread) => thread.threadId === body.threadId);

    if (!selectedThread) {
      return jsonError("Messaging thread not found.", 404);
    }

    await saveDefaultMessagingThreadForUser(authResult.supabase, {
      threadId: body.threadId,
      userId: authResult.userId,
    });

    const telegramConnection = await getTelegramConnectionForUser(
      authResult.supabase,
      authResult.userId,
    );

    if (telegramConnection) {
      await updateTelegramConnectionTargetThread(authResult.supabase, {
        targetThreadId: body.threadId,
        userId: authResult.userId,
      });

      const adminSupabase = await createAdminClient();
      await upsertTelegramChannelMapping(adminSupabase, {
        chatId: telegramConnection.externalConversationId,
        clientId: telegramConnection.clientId,
        threadId: body.threadId,
      });
    }

    return Response.json({ defaultThreadId: body.threadId });
  } catch (error) {
    console.error("[settings/profile/default-messaging-thread] Failed to update:", error);
    return jsonError("Failed to save messaging preference.", 500);
  }
}
