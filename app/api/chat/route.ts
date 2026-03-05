/**
 * Chat API endpoint backed by the runner engine.
 * @module app/api/chat/route
 */
import type { UIMessage } from "ai";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { resolveClientId } from "@/lib/chat/client-id";
import { runAgent } from "@/lib/runner/run-agent";
import { createClient } from "@/lib/supabase/server";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

/** Allows longer streaming runs on Vercel functions. */
export const maxDuration = 60;

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

  let body: PostRequestBody;
  try {
    body = postRequestBodySchema.parse(await request.json());
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const threadId = body.id;

  const input = body.message
    ? getTextFromMessage(body.message as UIMessage)
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
    const { data: thread, error: threadLookupError } = await supabase
      .from("conversation_threads")
      .select("thread_id")
      .eq("thread_id", threadId)
      .eq("client_id", clientId)
      .eq("is_archived", false)
      .maybeSingle();

    if (threadLookupError) {
      return jsonError("Failed to process chat request.", 500);
    }

    if (!thread) {
      return jsonError("Thread not found.", 404);
    }

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

    const stream = createUIMessageStream({
      originalMessages: body.messages as UIMessage[] | undefined,
      execute: async ({ writer }) => {
        writer.merge(result.streamResult.toUIMessageStream());
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch {
    return jsonError("Failed to process chat request.", 500);
  }
}
