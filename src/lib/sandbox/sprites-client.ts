/**
 * Thin wrapper around the Sprites SDK for per-thread Sprite lifecycle.
 * @module lib/sandbox/sprites-client
 */
import { SpritesClient } from "@fly/sprites";

const REQUIRED_ENV_VARS = ["SPRITES_TOKEN"] as const;

let cachedToken: string | null = null;
let cachedClient: SpritesClient | null = null;

/**
 * Validates the minimum environment required to talk to the Sprites API.
 */
export function validateSpritesEnv(
  env: Record<string, string | undefined> = process.env,
): void {
  for (const key of REQUIRED_ENV_VARS) {
    const value = env[key]?.trim();

    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}

/**
 * Returns a memoized Sprites client for the provided token.
 */
export function getSpritesClient(token?: string): SpritesClient {
  const resolvedToken = token?.trim() || process.env.SPRITES_TOKEN?.trim();

  if (!resolvedToken) {
    throw new Error("SPRITES_TOKEN is required");
  }

  if (cachedClient && cachedToken === resolvedToken) {
    return cachedClient;
  }

  cachedToken = resolvedToken;
  cachedClient = new SpritesClient(resolvedToken);
  return cachedClient;
}

/**
 * Returns the active Sprite for a thread, creating a fresh one only when needed.
 */
export async function getOrCreateSprite({
  token,
  existingSpriteName,
  spriteName,
}: {
  token: string;
  existingSpriteName?: string;
  spriteName: string;
}) {
  const client = getSpritesClient(token);

  if (existingSpriteName) {
    try {
      const sprite = client.sprite(existingSpriteName);
      await sprite.execFile("echo", ["ok"]);

      return {
        sprite,
        spriteName: existingSpriteName,
        isNew: false,
      };
    } catch {
      // The stored session may point to a destroyed Sprite. Fall through to creation.
    }
  }

  const sprite = await client.createSprite(spriteName);

  return {
    sprite,
    spriteName,
    isNew: true,
  };
}
