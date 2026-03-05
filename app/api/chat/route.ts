/**
 * Chat API endpoint backed by the runner engine.
 * @module app/api/chat/route
 */
import type { UIMessage } from "ai";
import { createUIMessageStream, createUIMessageStreamResponse, generateId } from "ai";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";

import { resolveClientId } from "@/lib/chat/client-id";
import { generateTitleFromUserMessage } from "@/lib/ai/title";
import { clearActiveStreamId, setActiveStreamId } from "@/lib/redis";
import { runAgent } from "@/lib/runner/run-agent";
import { createClient } from "@/lib/supabase/server";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

/** Allows longer streaming runs on Vercel functions. */
export const maxDuration = 60;

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch (_) {
    return null;
  }
}

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

function getTextFromUnknownParts(parts: unknown[]): string | null {
  const text = parts
    .filter((part): part is { type: string; text?: unknown } =>
      typeof part === "object" && part !== null && "type" in part
    )
    .filter((part): part is { type: "text"; text: string } =>
      part.type === "text" && typeof part.text === "string"
    )
    .map((part) => part.text.trim())
    .filter((part) => part.length > 0)
    .join("\n")
    .trim();

  return text.length > 0 ? text : null;
}

function getLatestUserInput(messages: PostRequestBody["messages"]): string | null {
  if (!Array.isArray(messages) || messages.length === 0) {
    return null;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") {
      continue;
    }

    const text = getTextFromUnknownParts(message.parts);
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
    let isNewThread = false;

    if (threadLookupError) {
      return jsonError("Failed to process chat request.", 500);
    }

    if (!thread) {
      if (!body.message || body.message.role !== "user") {
        return jsonError("Thread not found.", 404);
      }

      const { error: insertError } = await supabase
        .from("conversation_threads")
        .insert({ thread_id: threadId, client_id: clientId, title: null });

      if (insertError) {
        return jsonError("Failed to process chat request.", 500);
      }

      isNewThread = true;
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

    const titlePromise = isNewThread
      ? generateTitleFromUserMessage(input)
      : null;

    const stream = createUIMessageStream({
      originalMessages: body.messages as UIMessage[] | undefined,
      execute: async ({ writer }) => {
        writer.merge(result.streamResult.toUIMessageStream());

        if (titlePromise) {
          const title = await titlePromise;
          if (title.length > 0) {
            writer.write({ type: "data-chat-title", data: title });
            supabase
              .from("conversation_threads")
              .update({ title })
              .eq("thread_id", threadId)
              .then(() => {});
          }
        }
      },
      onFinish: async () => {
        if (!process.env.REDIS_URL) {
          return;
        }

        try {
          await clearActiveStreamId(threadId);
        } catch (_) {
          // Ignore Redis cleanup failures to avoid breaking completed responses.
        }
      },
    });

    return createUIMessageStreamResponse({
      stream,
      async consumeSseStream({ stream: sseStream }) {
        if (!process.env.REDIS_URL) {
          return;
        }

        try {
          const streamContext = getStreamContext();
          if (!streamContext) {
            return;
          }

          const streamId = generateId();
          await setActiveStreamId(threadId, streamId);
          await streamContext.createNewResumableStream(streamId, () => sseStream);
        } catch (_) {
          clearActiveStreamId(threadId).catch(() => {});
        }
      },
    });
  } catch {
    return jsonError("Failed to process chat request.", 500);
  }
}
