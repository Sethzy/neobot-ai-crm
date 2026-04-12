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
import { openSessionTail } from "@/lib/managed-agents/session-reconnect";
import { persistTurnInBackground } from "@/lib/managed-agents/persist-turn-in-background";
import { uploadFilePartsToAnthropic } from "@/lib/managed-agents/upload-files-for-session";
import { buildSystemReminder } from "@/lib/runner/system-reminder";
import { listCustomizedSkillSlugs } from "@/lib/runner/skills/list-customized-skill-slugs";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const messageBodySchema = z.object({
  threadId: z.string().min(1),
  message: z.object({
    id: z.string().optional(),
    role: z.literal("user"),
    parts: z.array(z.unknown()),
  }),
});

const approvalBodySchema = z.object({
  threadId: z.string().min(1),
  approval: z.object({
    toolUseId: z.string().min(1),
    result: z.enum(["allow", "deny"]),
    denyMessage: z.string().optional(),
  }),
});

const bodySchema = z.union([messageBodySchema, approvalBodySchema]);

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

  // ── Approval path: send user.tool_confirmation to the session ─────
  if ("approval" in body) {
    return handleApproval(body, supabase, clientId);
  }

  // ── Message path (existing) ───────────────────────────────────────
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

  // Open the persistence tail BEFORE sending the user message. The
  // resulting worker drains from the pre-send cursor after the response
  // is sent, which preserves the "subscribe before you send" guarantee
  // without making the read path own persistence.
  const tailHandle = await openSessionTail(anthropic, session.id);

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
      tailHandle,
    }),
  );

  return Response.json({ ok: true });
}

// ── Approval handler ──────────────────────────────────────────────────

async function handleApproval(
  body: z.infer<typeof approvalBodySchema>,
  supabase: Parameters<typeof persistTurnInBackground>[0]["supabase"],
  clientId: string,
): Promise<Response> {
  const { data: thread } = await supabase
    .from("conversation_threads")
    .select("session_id")
    .eq("thread_id", body.threadId)
    .eq("client_id", clientId)
    .eq("is_archived", false)
    .maybeSingle();

  if (!thread?.session_id) {
    return jsonError("Thread has no active session.", 404);
  }

  const sessionId = thread.session_id;
  const anthropic = getAnthropicClient();

  // Subscribe before send — open the persistence tail before posting
  // the confirmation so the background worker catches all post-approval
  // events. The original turn's worker stopped at requires_action.
  const tailHandle = await openSessionTail(anthropic, sessionId);

  await anthropic.beta.sessions.events.send(sessionId, {
    events: [
      body.approval.result === "allow"
        ? {
            type: "user.tool_confirmation",
            tool_use_id: body.approval.toolUseId,
            result: "allow" as const,
          }
        : {
            type: "user.tool_confirmation",
            tool_use_id: body.approval.toolUseId,
            result: "deny" as const,
            deny_message:
              body.approval.denyMessage ?? "User denied this action.",
          },
    ],
  } as never);

  after(() =>
    persistTurnInBackground({
      anthropic,
      supabase,
      clientId,
      threadId: body.threadId,
      sessionId,
      conversationInput: `[approval: ${body.approval.result}]`,
      tailHandle,
    }),
  );

  return Response.json({ ok: true });
}
