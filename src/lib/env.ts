/** Centralized environment validation for critical server-side env vars. */
import { z } from "zod";

const nonEmpty = z.string().min(1);

const serverEnvSchema = z.object({
  // Required — app cannot function without these
  SUPABASE_URL: nonEmpty,
  SUPABASE_ANON_KEY: nonEmpty,
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty,
  AI_GATEWAY_API_KEY: nonEmpty,

  // Optional — features degrade gracefully when missing
  REDIS_URL: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  COMPOSIO_API_KEY: z.string().min(1).optional(),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
  BRAVE_SEARCH_API_KEY: z.string().min(1).optional(),
  EXA_API_KEY: z.string().min(1).optional(),
  GOOGLE_MAPS_API_KEY: z.string().min(1).optional(),
  SENTRY_DSN: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
  SUNDER_INTERNAL_SECRET: z.string().min(1).optional(),

  // Vercel Sandbox (bash tool)
  SANDBOX_GOLDEN_SNAPSHOT_ID: z.string().trim().optional(),
  VERCEL_OIDC_TOKEN: z.string().trim().optional(),
  VERCEL_TOKEN: z.string().trim().optional(),
  VERCEL_TEAM_ID: z.string().trim().optional(),
  VERCEL_PROJECT_ID: z.string().trim().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let _cached: ServerEnv | null = null;

/**
 * Validate and return all critical server env vars.
 * Lazy-memoized: validates on first access, caches thereafter.
 * Safe to call from any context (startup, tests, scripts).
 */
export function getServerEnv(): ServerEnv {
  if (_cached) return _cached;

  const raw = {
    // Use || (not ??) so empty strings fall through to the fallback alias
    SUPABASE_URL: (
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
    ).trim(),
    SUPABASE_ANON_KEY: (
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      ""
    ).trim(),
    SUPABASE_SERVICE_ROLE_KEY: (
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
    ).trim(),
    AI_GATEWAY_API_KEY: (process.env.AI_GATEWAY_API_KEY ?? "").trim(),
    REDIS_URL: process.env.REDIS_URL?.trim() || undefined,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY?.trim() || undefined,
    STRIPE_WEBHOOK_SECRET:
      process.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined,
    COMPOSIO_API_KEY: process.env.COMPOSIO_API_KEY?.trim() || undefined,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined,
    TELEGRAM_WEBHOOK_SECRET:
      process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || undefined,
    BRAVE_SEARCH_API_KEY:
      process.env.BRAVE_SEARCH_API_KEY?.trim() || undefined,
    EXA_API_KEY: process.env.EXA_API_KEY?.trim() || undefined,
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY?.trim() || undefined,
    SENTRY_DSN: process.env.SENTRY_DSN?.trim() || undefined,
    CRON_SECRET: process.env.CRON_SECRET?.trim() || undefined,
    SUNDER_INTERNAL_SECRET:
      process.env.SUNDER_INTERNAL_SECRET?.trim() || undefined,
    SANDBOX_GOLDEN_SNAPSHOT_ID:
      process.env.SANDBOX_GOLDEN_SNAPSHOT_ID?.trim() || undefined,
    VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN?.trim() || undefined,
    VERCEL_TOKEN: process.env.VERCEL_TOKEN?.trim() || undefined,
    VERCEL_TEAM_ID: process.env.VERCEL_TEAM_ID?.trim() || undefined,
    VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID?.trim() || undefined,
  };

  const result = serverEnvSchema.safeParse(raw);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `[env] Missing or invalid required environment variables: ${missing}. ` +
        `Check .env.example for the full list.`,
    );
  }

  _cached = result.data;
  return _cached;
}

/** Reset cached env — test-only. */
export function _resetForTesting(): void {
  _cached = null;
}
