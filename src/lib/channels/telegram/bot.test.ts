/**
 * Tests for Telegram bot factory helpers.
 * @module lib/channels/telegram/bot.test
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTelegramBot, getTelegramBotToken } from "./bot";

describe("getTelegramBotToken", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns the TELEGRAM_BOT_TOKEN env var", () => {
    process.env.TELEGRAM_BOT_TOKEN = "123:ABC";
    expect(getTelegramBotToken()).toBe("123:ABC");
  });

  it("throws when the token is missing", () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(() => getTelegramBotToken()).toThrow("TELEGRAM_BOT_TOKEN");
  });

  it("trims surrounding whitespace", () => {
    process.env.TELEGRAM_BOT_TOKEN = "  123:ABC  ";
    expect(getTelegramBotToken()).toBe("123:ABC");
  });
});

describe("createTelegramBot", () => {
  it("creates a bot instance with the provided token", () => {
    const bot = createTelegramBot("123:ABC");
    expect(bot.token).toBe("123:ABC");
  });
});
