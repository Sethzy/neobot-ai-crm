/** Redis fixed-window rate limiter. Fail-open when Redis is unavailable. */
import { getRedisClient } from "@/lib/redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

const KEY_PREFIX = "ratelimit:";
const isLatencyDebugEnabled = process.env.DEBUG_LATENCY === "1";

function parseRedisIntegerReply(reply: unknown): number | null {
  if (typeof reply === "number" && Number.isFinite(reply)) {
    return reply;
  }

  if (typeof reply === "bigint") {
    const count = Number(reply);
    return Number.isSafeInteger(count) ? count : null;
  }

  if (typeof reply === "string") {
    const count = Number.parseInt(reply, 10);
    return Number.isNaN(count) ? null : count;
  }

  return null;
}

/**
 * Check if a request is within the rate limit using a fixed-window counter.
 * Uses MULTI/EXEC for atomic INCR + EXPIRE so a partial failure can't
 * leave a key without TTL (which would permanently 429 that user/IP).
 * @param key - Unique identifier (e.g., "chat:userId" or "webhook:ip")
 * @param limit - Max requests per window
 * @param windowSeconds - Window duration in seconds
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const tStart = performance.now();
  const client = await getRedisClient();
  if (isLatencyDebugEnabled) {
    const getClientMs = Math.round(performance.now() - tStart);
    console.info("[rate-limit] getRedisClient", {
      key,
      getClientMs,
      client: client === null ? "null" : "ok",
    });
  }
  if (!client) {
    return { allowed: true, remaining: limit };
  }

  const redisKey = `${KEY_PREFIX}${key}`;

  try {
    // Atomic: INCR the counter and set EXPIRE only if no TTL exists (NX).
    // EXPIRE NX is a no-op when the key already has a TTL, so subsequent
    // requests in the same window don't reset the window.
    const results = await client
      .multi()
      .incr(redisKey)
      .expire(redisKey, windowSeconds, "NX")
      .exec();

    const count = parseRedisIntegerReply(results[0]);
    if (count === null) {
      throw new Error("Unexpected Redis INCR reply type");
    }

    if (count > limit) {
      const ttl = await client.ttl(redisKey);
      return {
        allowed: false,
        remaining: 0,
        retryAfter: ttl > 0 ? ttl : windowSeconds,
      };
    }

    return { allowed: true, remaining: limit - count };
  } catch {
    // Fail open — don't block requests if Redis errors
    return { allowed: true, remaining: limit };
  }
}
