/**
 * Redis helpers for chat stream resumption state.
 * @module lib/redis
 */
import "server-only";

import { createClient } from "redis";

import { getServerEnv } from "@/lib/env";
import { createConsoleLogger } from "@/lib/logger";

const console = createConsoleLogger();

type RedisClient = ReturnType<typeof createClient>;

const REDIS_CONNECT_TIMEOUT_MS = 750;
const REDIS_FAILURE_COOLDOWN_MS = 30_000;
const isLatencyDebugEnabled = process.env.DEBUG_LATENCY === "1";

let redisClient: RedisClient | null = null;
let redisConnectPromise: Promise<RedisClient> | null = null;
let redisUnavailableUntilMs = 0;

export async function getRedisClient(): Promise<RedisClient | null> {
  const tEntry = performance.now();
  const redisUrl = getServerEnv().REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  if (Date.now() < redisUnavailableUntilMs) {
    if (isLatencyDebugEnabled) {
      console.info("[redis] skipping connect during cooldown", {
        remainingMs: redisUnavailableUntilMs - Date.now(),
      });
    }
    return null;
  }

  const wasOpen = redisClient?.isOpen ?? false;
  const hadInflight = redisConnectPromise !== null;
  if (isLatencyDebugEnabled) {
    console.info("[redis] getRedisClient called", {
      isOpen: wasOpen,
      hasPromise: hadInflight,
      hasClient: redisClient !== null,
    });
  }

  if (!redisClient) {
    redisClient = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
        reconnectStrategy: false,
      },
    });
    redisClient.on("error", (err) => {
      if (isLatencyDebugEnabled) {
        console.error("[redis] connection error:", err.message);
      }
    });
  }

  if (!redisClient.isOpen) {
    if (!redisConnectPromise) {
      const tConnectStart = performance.now();
      if (isLatencyDebugEnabled) {
        console.info("[redis] connect() started");
      }
      redisConnectPromise = redisClient.connect()
        .then((value) => {
          redisUnavailableUntilMs = 0;
          if (isLatencyDebugEnabled) {
            console.info("[redis] connect() resolved", {
              ms: Math.round(performance.now() - tConnectStart),
            });
          }
          return value;
        })
        .catch((err) => {
          redisUnavailableUntilMs = Date.now() + REDIS_FAILURE_COOLDOWN_MS;
          if (isLatencyDebugEnabled) {
            console.error("[redis] connect() rejected", {
              ms: Math.round(performance.now() - tConnectStart),
              message: err instanceof Error ? err.message : String(err),
              cooldownMs: REDIS_FAILURE_COOLDOWN_MS,
            });
          }
          throw err;
        })
        .finally(() => {
          redisConnectPromise = null;
        });
    }

    try {
      await redisConnectPromise;
    } catch {
      if (isLatencyDebugEnabled) {
        console.warn("[redis] getRedisClient returning null after connect failure", {
          totalMs: Math.round(performance.now() - tEntry),
        });
      }
      redisClient?.destroy();
      redisClient = null;
      return null;
    }
  }

  if (isLatencyDebugEnabled) {
    console.info("[redis] getRedisClient returning client", {
      totalMs: Math.round(performance.now() - tEntry),
    });
  }
  return redisClient;
}
