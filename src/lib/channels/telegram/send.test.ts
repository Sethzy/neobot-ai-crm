/**
 * Tests for Telegram send/message chunking helpers.
 * @module lib/channels/telegram/send.test
 */
import { describe, expect, it } from "vitest";

import {
  detectMediaType,
  normalizeTelegramChatId,
  splitTelegramMessage,
} from "./send";

describe("normalizeTelegramChatId", () => {
  it("returns a number for numeric ids", () => {
    expect(normalizeTelegramChatId("12345")).toBe(12345);
  });

  it("returns channel usernames as-is", () => {
    expect(normalizeTelegramChatId("@mychannel")).toBe("@mychannel");
  });

  it("prepends @ to non-numeric names", () => {
    expect(normalizeTelegramChatId("mychannel")).toBe("@mychannel");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeTelegramChatId("  12345  ")).toBe(12345);
  });
});

describe("splitTelegramMessage", () => {
  it("returns a single chunk for short text", () => {
    expect(splitTelegramMessage("hello")).toEqual(["hello"]);
  });

  it("splits at paragraph boundaries", () => {
    const text = `${"a".repeat(3800)}\n\n${"b".repeat(500)}`;
    const chunks = splitTelegramMessage(text);
    expect(chunks).toEqual(["a".repeat(3800), "b".repeat(500)]);
  });

  it("splits at line boundaries when paragraph breaks are absent", () => {
    const text = `${"a".repeat(3000)}\n${"b".repeat(1500)}`;
    const chunks = splitTelegramMessage(text, 4000);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe("a".repeat(3000));
  });

  it("respects a custom limit", () => {
    expect(splitTelegramMessage("hello world", 5)).toEqual(["hello", "world"]);
  });

  it("closes and reopens unclosed html tags across chunk boundaries", () => {
    const chunks = splitTelegramMessage(`<pre>${"x".repeat(5000)}</pre>`, 4000);
    expect(chunks[0]).toContain("</pre>");
    expect(chunks[1]).toContain("<pre>");
  });
});

describe("detectMediaType", () => {
  it("detects photos from image mime types", () => {
    expect(detectMediaType("image/jpeg")).toBe("photo");
  });

  it("detects videos from video mime types", () => {
    expect(detectMediaType("video/mp4")).toBe("video");
  });

  it("detects audio from audio mime types", () => {
    expect(detectMediaType("audio/mpeg")).toBe("audio");
  });

  it("falls back to documents for unknown types", () => {
    expect(detectMediaType("application/pdf")).toBe(
      "document",
    );
  });

  it("treats svg as a document instead of a photo", () => {
    expect(detectMediaType("image/svg+xml")).toBe(
      "document",
    );
  });
});
