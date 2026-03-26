/** Redis fixed-window rate limiter. Fail-open when Redis is unavailable. */
import { getRedisClient } from "@/lib/redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

const KEY_PREFIX = "ratelimit:";

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
  const client = await getRedisClient();
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

    const count = results[0] as number;

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
