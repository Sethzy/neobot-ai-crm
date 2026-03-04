/**
 * Chat API endpoint backed by the runner engine.
 * @module app/api/chat/route
 */
import type { UIMessage } from "ai";
import { z } from "zod";

import { resolveClientId } from "@/lib/chat/client-id";
import { processInboundMessage } from "@/lib/chat/process-inbound-message";
import { extractTextContent } from "@/lib/runner/message-utils";
import { createClient } from "@/lib/supabase/server";

/** Allows longer streaming runs on Vercel functions. */
export const maxDuration = 60;

interface ChatRequestBody {
  id?: string;
  threadId?: string;
  message?: string | UIMessage;
  messages?: UIMessage[];
  deliveryId?: string;
}

const threadIdSchema = z.string().uuid();

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function withCanonicalThreadIdHeader(response: Response, threadId: string): Response {
  const headers = new Headers(response.headers);
  headers.set("x-thread-id", threadId);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function getTextFromMessage(message: UIMessage): string | null {
  const legacyContentText = extractTextContent(
    typeof message === "object" && message !== null && "content" in message
      ? (message as { content?: unknown }).content
      : null,
  );
  if (legacyContentText.length > 0) {
    return legacyContentText;
  }

  const partsText = extractTextContent(message.parts);
  return partsText.length > 0 ? partsText : null;
}

function getLatestUserInput(messages: UIMessage[] | undefined): string | null {
  if (!Array.isArray(messages) || messages.length === 0) {
    return null;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") {
      continue;
    }

    const text = getTextFromMessage(message);
    if (text) {
      return text;
    }
  }

  return null;
}

export async function POST(request: Request): Promise<Response> {
  if (!process.env.AI_GATEWAY_API_KEY) {
    return jsonError("Server misconfiguration: AI_GATEWAY_API_KEY is required.", 500);
  }

  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON payload.", 400);
  }

  const threadId = typeof body.id === "string" && body.id.length > 0
    ? body.id
    : typeof body.threadId === "string" && body.threadId.length > 0
      ? body.threadId
      : null;

  if (!threadId) {
    return jsonError("Invalid request body: id (thread id) is required.", 400);
  }

  if (!threadIdSchema.safeParse(threadId).success) {
    return jsonError("Invalid request body: thread id must be a UUID.", 400);
  }

  const input = typeof body.message === "string"
    ? body.message.trim()
    : body.message
      ? getTextFromMessage(body.message)
      : getLatestUserInput(body.messages);

  if (!input) {
    return jsonError("Invalid request body: could not resolve latest user message text.", 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonError("Unauthorized.", 401);
  }

  try {
    const clientId = await resolveClientId(supabase, user.id);

    const result = await processInboundMessage({
      supabase,
      clientId,
      channel: "web",
      externalConversationId: threadId,
      requestedThreadId: threadId,
      messageText: input,
      deliveryId: typeof body.deliveryId === "string" ? body.deliveryId : undefined,
      triggerType: "chat",
    });

    if (result.status === "queued") {
      return Response.json(
        { status: "queued" },
        {
          status: 202,
          headers: { "x-thread-id": result.threadId },
        },
      );
    }

    if (result.status === "duplicate") {
      return Response.json(
        { status: "duplicate" },
        {
          status: 200,
          headers: { "x-thread-id": result.threadId },
        },
      );
    }

    return withCanonicalThreadIdHeader(
      result.streamResult.toUIMessageStreamResponse(),
      result.threadId,
    );
  } catch (error) {
    console.error("[chat/route] Failed to process chat request:", error);
    return jsonError("Failed to process chat request.", 500);
  }
}
