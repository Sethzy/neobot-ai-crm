/**
 * Chat API endpoint backed by the runner engine.
 * @module app/api/chat/route
 */
import type { UIMessage } from "ai";
import { z } from "zod";

import { resolveClientId } from "@/lib/chat/client-id";
import { runAgent } from "@/lib/runner/run-agent";
import { createClient } from "@/lib/supabase/server";

/** Allows longer streaming runs on Vercel functions. */
export const maxDuration = 60;

interface ChatRequestBody {
  id?: string;
  threadId?: string;
  message?: string;
  messages?: UIMessage[];
}

const threadIdSchema = z.string().uuid();

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function getTextFromMessage(message: UIMessage): string | null {
  const legacyContent = "content" in message && typeof message.content === "string"
    ? message.content.trim()
    : "";
  if (legacyContent.length > 0) {
    return legacyContent;
  }

  const parts = Array.isArray(message.parts) ? message.parts : [];
  const text = parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text.trim())
    .filter((part) => part.length > 0)
    .join("\n")
    .trim();

  return text.length > 0 ? text : null;
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

  const input = typeof body.message === "string" && body.message.trim().length > 0
    ? body.message.trim()
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
    const result = await runAgent(
      {
        clientId,
        threadId,
        triggerType: "chat",
        input,
      },
      supabase,
    );

    if (result.status === "queued") {
      return Response.json({ status: "queued" }, { status: 202 });
    }

    return result.streamResult.toUIMessageStreamResponse();
  } catch {
    return jsonError("Failed to process chat request.", 500);
  }
}
