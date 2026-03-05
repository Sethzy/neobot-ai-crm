/**
 * Shared authorization helpers for internal cron-trigger routes.
 * @module lib/triggers/route-auth
 */
import { jsonError } from "@/lib/api/route-helpers";

/**
 * Validates the bearer token for internal cron-trigger routes.
 */
export function requireCronSecret(request: Request): Response | null {
  const configuredSecret = (process.env.CRON_SECRET ?? "").trim();

  if (!configuredSecret) {
    return jsonError("Server misconfiguration: CRON_SECRET is required.", 500);
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${configuredSecret}`) {
    return jsonError("Unauthorized", 401);
  }

  return null;
}
