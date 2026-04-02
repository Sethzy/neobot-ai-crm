/**
 * PostHog client-side initialization via Next.js instrumentation hook.
 * @module instrumentation-client
 */
import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

import { getAnalyticsEnvironment } from "@/lib/analytics/posthog-context";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    sendDefaultPii: false,
    environment:
      process.env.NEXT_PUBLIC_POSTHOG_ENVIRONMENT ?? process.env.NODE_ENV,
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
        delete event.request.headers["x-supabase-auth"];
      }
      if (event.request?.cookies) {
        event.request.cookies = {};
      }
      return event;
    },
  });
}

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
const analyticsEnvironment = getAnalyticsEnvironment();

if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    defaults: "2026-01-30",
  });
  posthog.register({
    environment: analyticsEnvironment,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
