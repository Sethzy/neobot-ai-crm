/** Sentry browser-side initialization. */
import * as Sentry from "@sentry/nextjs";

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
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
        delete event.request.headers["x-supabase-auth"];
      }
      if (event.request?.cookies) {
        event.request.cookies = {};
      }
      return event;
    },
  });
}
