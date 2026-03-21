/**
 * Tests for Telegram markdown-to-HTML formatting helpers.
 * @module lib/channels/telegram/format.test
 */
import { describe, expect, it } from "vitest";

import { markdownToTelegramHtml, sanitizeTelegramHtml } from "./format";

describe("markdownToTelegramHtml", () => {
  it("converts bold markdown to Telegram HTML", () => {
    expect(markdownToTelegramHtml("**hello**")).toBe("<b>hello</b>");
  });

  it("converts italic markdown to Telegram HTML", () => {
    expect(markdownToTelegramHtml("*hello*")).toBe("<i>hello</i>");
  });

  it("converts strikethrough markdown to Telegram HTML", () => {
    expect(markdownToTelegramHtml("~~hello~~")).toBe("<s>hello</s>");
  });

  it("converts inline code to code tags", () => {
    expect(markdownToTelegramHtml("`code`")).toBe("<code>code</code>");
  });

  it("converts code fences to pre/code tags", () => {
    const result = markdownToTelegramHtml("```ts\nconst x = 1;\n```");
    expect(result).toContain('<pre><code class="language-ts">');
    expect(result).toContain("const x = 1;");
  });

  it("converts markdown links to anchor tags", () => {
    expect(markdownToTelegramHtml("[click](https://example.com)")).toBe(
      '<a href="https://example.com">click</a>',
    );
  });

  it("converts headings to bold tags", () => {
    expect(markdownToTelegramHtml("## Title")).toBe("<b>Title</b>");
  });

  it("converts blockquotes", () => {
    expect(markdownToTelegramHtml("> quoted")).toBe("<blockquote>quoted</blockquote>");
  });

  it("escapes plain-text html entities", () => {
    expect(markdownToTelegramHtml("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
  });

  it("preserves existing html tags", () => {
    expect(markdownToTelegramHtml("<b>already bold</b>")).toContain("<b>already bold</b>");
  });

  it("protects code blocks from markdown processing", () => {
    const result = markdownToTelegramHtml("```\n**not bold**\n```");
    expect(result).not.toContain("<b>");
    expect(result).toContain("**not bold**");
  });
});

describe("sanitizeTelegramHtml", () => {
  it("passes through supported tags", () => {
    expect(sanitizeTelegramHtml("<b>bold</b>")).toBe("<b>bold</b>");
  });

  it("strips unsupported tags", () => {
    expect(sanitizeTelegramHtml("<div>text</div>")).toBe("text");
  });

  it("closes unclosed tags", () => {
    expect(sanitizeTelegramHtml("<b>unclosed")).toBe("<b>unclosed</b>");
  });

  it("drops orphaned closing tags", () => {
    expect(sanitizeTelegramHtml("text</b>")).toBe("text");
  });

  it("fixes misnested tags", () => {
    const result = sanitizeTelegramHtml("<b><i>text</b></i>");
    expect(result).toContain("</i>");
    expect(result).toContain("</b>");
  });
});
