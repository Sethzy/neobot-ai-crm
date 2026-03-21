/**
 * Markdown -> Telegram HTML conversion and sanitization.
 * Copied from dorabot with zero-drift behavior.
 * @module lib/channels/telegram/format
 */

/** Escapes plain-text HTML characters for Telegram's HTML parse mode. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Converts markdown-ish text into Telegram-compatible HTML.
 * Existing HTML tags are protected from double-processing.
 */
export function markdownToTelegramHtml(text: string): string {
  let result = text;

  const htmlTags: string[] = [];
  result = result.replace(/<(\/?)(\w+)([^>]*)>/g, (match) => {
    const index = htmlTags.length;
    htmlTags.push(match);
    return `\x00HT${index}\x00`;
  });

  const codeBlocks: string[] = [];
  result = result.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, language, code) => {
    const index = codeBlocks.length;
    const escaped = escapeHtml(code.trimEnd());
    const languageAttribute = language ? ` class="language-${language}"` : "";
    codeBlocks.push(`<pre><code${languageAttribute}>${escaped}</code></pre>`);
    return `\x00CB${index}\x00`;
  });

  const inlineCodes: string[] = [];
  result = result.replace(/`([^`\n]+)`/g, (_, code) => {
    const index = inlineCodes.length;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return `\x00IC${index}\x00`;
  });

  const links: string[] = [];
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, url) => {
    const index = links.length;
    links.push(`<a href="${url}">${escapeHtml(linkText)}</a>`);
    return `\x00LK${index}\x00`;
  });

  result = escapeHtml(result);

  result = result.replace(/\|\|(.+?)\|\|/g, "<tg-spoiler>$1</tg-spoiler>");
  result = result.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  result = result.replace(/__(.+?)__/g, "<b>$1</b>");
  result = result.replace(/(?<!\w)\*([^*\n]+?)\*(?!\w)/g, "<i>$1</i>");
  result = result.replace(/(?<!\w)_([^_\n]+?)_(?!\w)/g, "<i>$1</i>");
  result = result.replace(/~~(.+?)~~/g, "<s>$1</s>");
  result = result.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");
  result = result.replace(/^&gt;\s?(.+)$/gm, "<blockquote>$1</blockquote>");
  result = result.replace(/<\/blockquote>\n<blockquote>/g, "\n");
  result = result.replace(
    /<blockquote>([\s\S]{500,}?)<\/blockquote>/g,
    "<blockquote expandable>$1</blockquote>",
  );

  result = result.replace(/\x00CB(\d+)\x00/g, (_, index) => codeBlocks[Number(index)]);
  result = result.replace(/\x00IC(\d+)\x00/g, (_, index) => inlineCodes[Number(index)]);
  result = result.replace(/\x00LK(\d+)\x00/g, (_, index) => links[Number(index)]);
  result = result.replace(/\x00HT(\d+)\x00/g, (_, index) => htmlTags[Number(index)]);

  return result;
}

const SUPPORTED_TAGS = new Set([
  "b",
  "i",
  "u",
  "s",
  "code",
  "pre",
  "a",
  "blockquote",
  "tg-spoiler",
]);

/**
 * Sanitizes HTML for Telegram by stripping unsupported tags and closing
 * mismatched tag pairs.
 */
export function sanitizeTelegramHtml(html: string): string {
  const stack: string[] = [];

  return html.replace(
    /<(\/?)([a-z][a-z0-9-]*)([^>]*?)(\/?)\s*>/gi,
    (match, slash, tag, _attrs, selfClose) => {
      const normalizedTag = tag.toLowerCase();

      if (!SUPPORTED_TAGS.has(normalizedTag)) {
        return "";
      }

      if (selfClose) {
        return match;
      }

      if (slash) {
        const matchingIndex = stack.lastIndexOf(normalizedTag);
        if (matchingIndex < 0) {
          return "";
        }

        let extraClosers = "";
        for (let index = stack.length - 1; index > matchingIndex; index -= 1) {
          extraClosers += `</${stack[index]}>`;
        }

        stack.length = matchingIndex;
        return extraClosers + `</${normalizedTag}>`;
      }

      stack.push(normalizedTag);
      return match;
    },
  ) + stack.reverse().map((tag) => `</${tag}>`).join("");
}
