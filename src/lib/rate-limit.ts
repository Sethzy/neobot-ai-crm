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
    const count = await client.incr(redisKey);

    // Set expiry on the first request in this window
    if (count === 1) {
      await client.expire(redisKey, windowSeconds);
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
