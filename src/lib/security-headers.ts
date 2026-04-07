/**
 * Security headers applied to all routes via next.config.ts headers().
 * CSP is report-only for the first pass — promote to enforcing after
 * verifying no violations in production.
 */

// Derive Supabase host from env or fall back to the known project host.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
  : "xtewwwycvapskgvfnliq.supabase.co";

// NEXT_PUBLIC_POSTHOG_HOST may be a full URL (https://us.i.posthog.com) or bare host.
// Normalize to bare host so CSP entries don't produce https://https://...
const rawPosthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "us.i.posthog.com";
const posthogHost = rawPosthogHost.startsWith("http")
  ? new URL(rawPosthogHost).host
  : rawPosthogHost;

const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://${posthogHost} https://vercel.live`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  `img-src 'self' data: blob: https://${supabaseHost}`,
  `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://${posthogHost} https://vercel.live https://backend.composio.dev`,
  "frame-ancestors 'none'",
].join("; ");

export const securityHeaders: { key: string; value: string }[] = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=()",
  },
  { key: "Content-Security-Policy-Report-Only", value: cspDirectives },
];
