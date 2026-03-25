/**
 * Telegram text/media sending helpers with HTML fallback and safe chunking.
 * Adapted from dorabot with minimal Sunder-specific drift.
 * @module lib/channels/telegram/send
 */
import { extname } from "node:path";

import type { Api } from "grammy";
import { InputFile } from "grammy";
import { lookup } from "mime-types";

import { markdownToTelegramHtml, sanitizeTelegramHtml } from "./format";

const MSG_LIMIT = 4000;

/** Returns true when Telegram rejects a message because it can't parse the HTML. */
function isTelegramHtmlParseError(error: unknown): boolean {
  return (error as { description?: string })?.description?.includes("can't parse") ?? false;
}

/** Normalizes a Telegram chat identifier into the form grammY expects. */
export function normalizeTelegramChatId(target: string): number | string {
  const trimmed = target.trim();
  const numericId = Number(trimmed);

  if (!Number.isNaN(numericId) && String(numericId) === trimmed) {
    return numericId;
  }

  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

function isInsideTag(text: string, position: number): boolean {
  const before = text.slice(0, position);
  const lastOpen = before.lastIndexOf("<");
  if (lastOpen < 0) {
    return false;
  }

  const lastClose = before.lastIndexOf(">", lastOpen);
  return lastClose < lastOpen;
}

function getUnclosedTags(text: string): string[] {
  const stack: string[] = [];
  const tagRegex = /<(\/?)(\w+)(?:\s[^>]*)?>/g;
  let match: RegExpExecArray | null = null;

  while ((match = tagRegex.exec(text))) {
    const [, closing, tag] = match;
    const normalizedTag = tag.toLowerCase();

    if (
      normalizedTag !== "pre" &&
      normalizedTag !== "blockquote" &&
      normalizedTag !== "code"
    ) {
      continue;
    }

    if (closing) {
      const matchingIndex = stack.lastIndexOf(normalizedTag);
      if (matchingIndex >= 0) {
        stack.splice(matchingIndex, 1);
      }
      continue;
    }

    stack.push(normalizedTag);
  }

  return stack;
}

/**
 * Splits long Telegram HTML/text into safe chunks that avoid breaking inside
 * open tags and prefer paragraph or line boundaries.
 */
export function splitTelegramMessage(text: string, limit = MSG_LIMIT): string[] {
  if (text.length <= limit) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > limit) {
    let splitAt = -1;

    const paragraphIndex = remaining.lastIndexOf("\n\n", limit);
    if (paragraphIndex > limit * 0.3 && !isInsideTag(remaining, paragraphIndex)) {
      const unclosed = getUnclosedTags(remaining.slice(0, paragraphIndex));
      if (unclosed.length === 0) {
        splitAt = paragraphIndex;
      }
    }

    if (splitAt < 0) {
      const lineIndex = remaining.lastIndexOf("\n", limit);
      if (lineIndex > limit * 0.3 && !isInsideTag(remaining, lineIndex)) {
        const unclosed = getUnclosedTags(remaining.slice(0, lineIndex));
        if (unclosed.length === 0) {
          splitAt = lineIndex;
        }
      }
    }

    if (splitAt < 0) {
      const sentenceIndex = remaining.lastIndexOf(". ", limit);
      if (sentenceIndex > limit * 0.3 && !isInsideTag(remaining, sentenceIndex)) {
        const unclosed = getUnclosedTags(remaining.slice(0, sentenceIndex));
        if (unclosed.length === 0) {
          splitAt = sentenceIndex + 1;
        }
      }
    }

    if (splitAt < 0) {
      splitAt = limit;
      const unclosed = getUnclosedTags(remaining.slice(0, splitAt));

      if (unclosed.length > 0) {
        const closeTags = [...unclosed].reverse().map((tag) => `</${tag}>`).join("");
        const openTags = [...unclosed].map((tag) => `<${tag}>`).join("");
        chunks.push(remaining.slice(0, splitAt).trimEnd() + closeTags);
        remaining = openTags + remaining.slice(splitAt).trimStart();
        continue;
      }
    }

    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

/** Detects which Telegram media send method should be used for one MIME type. */
export function detectMediaType(
  mimeType: string,
): "photo" | "video" | "audio" | "document" {
  if (mimeType.startsWith("image/") && !mimeType.includes("svg")) {
    return "photo";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  return "document";
}

function resolveMediaMimeType(mediaSource: string): string {
  if (mediaSource.startsWith("http://") || mediaSource.startsWith("https://")) {
    const url = new URL(mediaSource);
    return lookup(extname(url.pathname)) || "application/octet-stream";
  }

  return lookup(mediaSource) || "application/octet-stream";
}

function createTelegramInputFile(mediaSource: string): InputFile {
  if (mediaSource.startsWith("http://") || mediaSource.startsWith("https://")) {
    return new InputFile(new URL(mediaSource));
  }

  return new InputFile(mediaSource);
}

async function sendMedia(
  api: Api,
  chatId: number | string,
  mediaSource: string,
  caption?: string,
  replyTo?: number,
): Promise<{ id: string; chatId: string }> {
  const mimeType = resolveMediaMimeType(mediaSource);
  const mediaType = detectMediaType(mimeType);
  const file = createTelegramInputFile(mediaSource);
  const replyParameters = replyTo ? { message_id: replyTo } : undefined;
  const sendOptions = {
    caption: caption ? sanitizeTelegramHtml(markdownToTelegramHtml(caption)) : undefined,
    parse_mode: "HTML" as const,
    reply_parameters: replyParameters,
  };

  let result:
    | Awaited<ReturnType<Api["sendPhoto"]>>
    | Awaited<ReturnType<Api["sendVideo"]>>
    | Awaited<ReturnType<Api["sendAudio"]>>
    | Awaited<ReturnType<Api["sendDocument"]>>;

  if (mediaType === "photo") {
    result = await api.sendPhoto(chatId, file, sendOptions);
  } else if (mediaType === "video") {
    result = await api.sendVideo(chatId, file, sendOptions);
  } else if (mediaType === "audio") {
    result = await api.sendAudio(chatId, file, sendOptions);
  } else {
    result = await api.sendDocument(chatId, file, sendOptions);
  }

  return {
    id: String(result.message_id),
    chatId: String(result.chat.id),
  };
}

/**
 * Sends one Telegram message, converting markdown to HTML and falling back to
 * plain text if Telegram rejects the markup.
 */
export async function sendTelegramMessage(
  api: Api,
  target: string,
  text: string,
  options?: { replyTo?: number; media?: string },
): Promise<{ id: string; chatId: string }> {
  const chatId = normalizeTelegramChatId(target);

  if (options?.media) {
    return sendMedia(api, chatId, options.media, text || undefined, options.replyTo);
  }

  const html = sanitizeTelegramHtml(markdownToTelegramHtml(text));
  const htmlChunks = splitTelegramMessage(html);

  let firstMessage:
    | Awaited<ReturnType<Api["sendMessage"]>>
    | undefined;

  try {
    firstMessage = await api.sendMessage(chatId, htmlChunks[0], {
      parse_mode: "HTML",
      reply_parameters: options?.replyTo ? { message_id: options.replyTo } : undefined,
    });
  } catch (error) {
    if (!isTelegramHtmlParseError(error)) {
      throw error;
    }

    console.warn("[telegram] HTML parse failed, falling back to plain text");
    const plainChunks = splitTelegramMessage(text);
    firstMessage = await api.sendMessage(chatId, plainChunks[0], {
      reply_parameters: options?.replyTo ? { message_id: options.replyTo } : undefined,
    });

    for (let index = 1; index < plainChunks.length; index += 1) {
      await api.sendMessage(chatId, plainChunks[index]);
    }

    return {
      id: String(firstMessage.message_id),
      chatId: String(firstMessage.chat.id),
    };
  }

  for (let index = 1; index < htmlChunks.length; index += 1) {
    try {
      await api.sendMessage(chatId, htmlChunks[index], { parse_mode: "HTML" });
    } catch (error) {
      if (!isTelegramHtmlParseError(error)) {
        throw error;
      }

      console.warn(`[telegram] HTML parse failed on chunk ${index}, sending plain text`);
      await api.sendMessage(chatId, htmlChunks[index].replace(/<[^>]+>/g, ""));
    }
  }

  return {
    id: String(firstMessage.message_id),
    chatId: String(firstMessage.chat.id),
  };
}

/** Edits one Telegram message, falling back to plain text if HTML fails. */
export async function editTelegramMessage(
  api: Api,
  chatId: string,
  messageId: string,
  newText: string,
): Promise<void> {
  const normalizedChatId = normalizeTelegramChatId(chatId);
  const html = sanitizeTelegramHtml(markdownToTelegramHtml(newText));
  const htmlChunks = splitTelegramMessage(html);

  try {
    await api.editMessageText(normalizedChatId, Number(messageId), htmlChunks[0], {
      parse_mode: "HTML",
    });
  } catch (error) {
    if (!isTelegramHtmlParseError(error)) {
      throw error;
    }

    console.warn("[telegram] HTML parse failed on edit, falling back to plain text");
    await api.editMessageText(normalizedChatId, Number(messageId), newText.slice(0, MSG_LIMIT));
    return;
  }

  for (let index = 1; index < htmlChunks.length; index += 1) {
    try {
      await api.sendMessage(normalizedChatId, htmlChunks[index], { parse_mode: "HTML" });
    } catch (error) {
      if (!isTelegramHtmlParseError(error)) {
        throw error;
      }

      await api.sendMessage(normalizedChatId, htmlChunks[index].replace(/<[^>]+>/g, ""));
    }
  }
}

/** Deletes one Telegram message. */
export async function deleteTelegramMessage(
  api: Api,
  chatId: string,
  messageId: string,
): Promise<void> {
  await api.deleteMessage(normalizeTelegramChatId(chatId), Number(messageId));
}
