/**
 * POST /api/chat/send
 *
 * Fire-and-forget endpoint for pushing a user message into a thread's
 * Anthropic session. Persists the user message, uploads any attachments,
 * sends `user.message` to the session, and kicks off a background
 * persistence worker for the resulting assistant turn. Returns 200
 * immediately — the browser's open `/api/chat/stream` subscription is
 * responsible for streaming agent events to the UI.
 *
 * Works whether the session is `idle` or `running` — the Managed Agents
 * runtime natively handles mid-run steering, so there is no thread lock.
 *
 * @module app/api/chat/send/route
 */
import { after } from "next/server";
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { extractUserInput } from "@/lib/chat/extract-user-input";
import { upsertMessage } from "@/lib/chat/messages";
import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";
import {
  buildKickoffContent,
  getOrCreateSession,
} from "@/lib/managed-agents/session-kickoff";
import { persistTurnInBackground } from "@/lib/managed-agents/persist-turn-in-background";
import { uploadFilePartsToAnthropic } from "@/lib/managed-agents/upload-files-for-session";
import { buildSystemReminder } from "@/lib/runner/system-reminder";
import { listCustomizedSkillSlugs } from "@/lib/runner/skills/list-customized-skill-slugs";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  threadId: z.string().min(1),
  message: z.object({
    id: z.string().optional(),
    role: z.literal("user"),
    parts: z.array(z.unknown()),
  }),
});

export async function POST(request: Request): Promise<Response> {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const auth = await authenticateRequest();
  if (auth.kind === "error") return auth.response;
  const { supabase, userId } = auth;

  const { allowed, retryAfter } = await checkRateLimit(
    `chat:${userId}`,
    30,
    60,
  );
  if (!allowed) {
    return new Response(
      JSON.stringify({
        error:
          "Rate limit exceeded. Please wait before sending more messages.",
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter ?? 60),
        },
      },
    );
  }

  const clientId = await resolveClientId(supabase, userId);

  // Extract text + file parts from the message.
  const { text, fileParts } = extractUserInput(body.message);

  if (!text && fileParts.length === 0) {
    return jsonError("Message must contain text or files.", 400);
  }

  // Resolve thread (create on first turn).
  const { data: existingThread, error: threadLookupError } = await supabase
    .from("conversation_threads")
    .select("thread_id, title")
    .eq("thread_id", body.threadId)
    .eq("client_id", clientId)
    .eq("is_archived", false)
    .maybeSingle();

  if (threadLookupError) {
    return jsonError("Failed to process request.", 500);
  }

  let threadTitle: string | null = null;

  if (!existingThread) {
    const { error: insertError } = await supabase
      .from("conversation_threads")
      .insert({
        thread_id: body.threadId,
        client_id: clientId,
        title: null,
      });
    if (insertError) {
      return jsonError("Failed to create thread.", 500);
    }
  } else {
    threadTitle = existingThread.title;
  }

  // Load client context and build reminder in parallel.
  const [clientContextResult, reminder, customizedSlugs] = await Promise.all([
    supabase
      .from("clients")
      .select("client_profile, user_preferences")
      .eq("client_id", clientId)
      .single(),
    buildSystemReminder(supabase, clientId),
    listCustomizedSkillSlugs(supabase, clientId),
  ]);

  const clientProfile = clientContextResult.data?.client_profile ?? null;
  const userPreferences = clientContextResult.data?.user_preferences ?? null;

  // Persist the user message (idempotent via source_event_id).
  const sourceEventId =
    body.message.id ?? `user:${crypto.randomUUID()}`;

  await upsertMessage(supabase, {
    thread_id: body.threadId,
    role: "user",
    content: text,
    parts: body.message.parts as never,
    source_event_id: sourceEventId,
  });

  // Upload attachments and get/create the session.
  const anthropic = getAnthropicClient();
  const uploads =
    fileParts.length > 0
      ? await uploadFilePartsToAnthropic(anthropic, fileParts)
      : [];

  const session = await getOrCreateSession({
    anthropic,
    supabase,
    threadId: body.threadId,
    threadTitle,
    initialResources: uploads.map((f) => ({
      type: "file" as const,
      file_id: f.fileId,
      mount_path: `/mnt/session/uploads/${f.fileId}`,
    })),
  });

  // Build kickoff content and send user.message to the session.
  const kickoff = buildKickoffContent({
    clientProfile: session.created ? clientProfile : null,
    userPreferences: session.created ? userPreferences : null,
    systemReminder: reminder,
    userMessage: text ?? "",
    customizedSkillSlugs: customizedSlugs,
  });

  await anthropic.beta.sessions.events.send(session.id, {
    events: [{ type: "user.message", content: kickoff }],
  } as never);

  // Fire the background persistence worker via after() so it runs after
  // the response is sent. This is the correct Vercel primitive — void
  // promises get killed when the response finishes.
  after(() =>
    persistTurnInBackground({
      anthropic,
      supabase,
      clientId,
      threadId: body.threadId,
      sessionId: session.id,
      conversationInput: text ?? "",
    }),
  );

  return Response.json({ ok: true });
}
