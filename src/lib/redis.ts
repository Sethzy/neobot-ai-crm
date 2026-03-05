/**
 * Redis helpers for chat stream resumption state.
 * @module lib/redis
 */
import { createClient } from "redis";

const ACTIVE_STREAM_KEY_PREFIX = "chat:active-stream:";
const ACTIVE_STREAM_TTL_SECONDS = 120;

type RedisClient = ReturnType<typeof createClient>;

let redisClient: RedisClient | null = null;
let redisConnectPromise: Promise<RedisClient> | null = null;

async function getRedisClient(): Promise<RedisClient | null> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  if (!redisClient) {
    redisClient = createClient({ url: redisUrl });
    redisClient.on("error", () => {});
  }

  if (!redisClient.isOpen) {
    if (!redisConnectPromise) {
      redisConnectPromise = redisClient.connect().finally(() => {
        redisConnectPromise = null;
      });
    }

    try {
      await redisConnectPromise;
    } catch {
      redisClient = null;
      return null;
    }
  }

  return redisClient;
}

export async function setActiveStreamId(threadId: string, streamId: string): Promise<void> {
  const client = await getRedisClient();
  if (!client) {
    return;
  }

  await client.set(`${ACTIVE_STREAM_KEY_PREFIX}${threadId}`, streamId, {
    EX: ACTIVE_STREAM_TTL_SECONDS,
  });
}

export async function getActiveStreamId(threadId: string): Promise<string | null> {
  const client = await getRedisClient();
  if (!client) {
    return null;
  }

  return client.get(`${ACTIVE_STREAM_KEY_PREFIX}${threadId}`);
}

export async function clearActiveStreamId(threadId: string): Promise<void> {
  const client = await getRedisClient();
  if (!client) {
    return;
  }

  await client.del(`${ACTIVE_STREAM_KEY_PREFIX}${threadId}`);
}
