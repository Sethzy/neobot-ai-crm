/**
 * Redis helpers for chat stream resumption state.
 * @module lib/redis
 */
import { createClient } from "redis";

import { getServerEnv } from "@/lib/env";

type RedisClient = ReturnType<typeof createClient>;

let redisClient: RedisClient | null = null;
let redisConnectPromise: Promise<RedisClient> | null = null;

export async function getRedisClient(): Promise<RedisClient | null> {
  const redisUrl = getServerEnv().REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  if (!redisClient) {
    redisClient = createClient({ url: redisUrl });
    redisClient.on("error", (err) => {
      console.error("[redis] connection error:", err.message);
    });
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
