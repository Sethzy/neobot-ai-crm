/**
 * Telegram bot factory, token validation, and lightweight bot metadata caching.
 * @module lib/channels/telegram/bot
 */
import { Bot } from "grammy";

export interface TelegramBotInfo {
  id: number;
  username: string;
  firstName: string;
}

let cachedBotUsernamePromise: Promise<string> | null = null;

/** Resolves the Telegram bot token from environment configuration. */
export function getTelegramBotToken(): string {
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();

  if (!token) {
    throw new Error(
      "No Telegram bot token found. Set TELEGRAM_BOT_TOKEN environment variable.",
    );
  }

  return token;
}

/** Creates a grammY bot instance for one Telegram token. */
export function createTelegramBot(token: string): Bot {
  return new Bot(token);
}

/** Validates a token by calling Telegram's getMe endpoint. */
export async function validateTelegramToken(token: string): Promise<TelegramBotInfo> {
  const bot = new Bot(token);
  const me = await bot.api.getMe();

  return {
    id: me.id,
    username: me.username || "",
    firstName: me.first_name,
  };
}

/** Returns the bot username, resolving it once from Telegram and then caching it. */
export async function getBotUsername(): Promise<string> {
  if (!cachedBotUsernamePromise) {
    cachedBotUsernamePromise = validateTelegramToken(getTelegramBotToken())
      .then((info) => info.username)
      .catch((error) => {
        cachedBotUsernamePromise = null;
        throw error;
      });
  }

  return cachedBotUsernamePromise;
}
