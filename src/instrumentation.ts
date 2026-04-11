/**
 * Next.js instrumentation file — auto-loaded on app startup.
 * Initializes Sentry once per runtime and exports the request error hook.
 */
import * as Sentry from "@sentry/nextjs";
let hasInitializedSentry = false;

function initSentryForRuntime() {
  if (hasInitializedSentry || !process.env.SENTRY_DSN) {
    return;
  }

  hasInitializedSentry = true;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
        delete event.request.headers["x-supabase-auth"];
      }
      if (event.request?.cookies) {
        event.request.cookies = {};
      }
      if (event.request?.url) {
        event.request.url = event.request.url
          .replace(/apikey=[^&]+/g, "apikey=[FILTERED]")
          .replace(/token=[^&]+/g, "token=[FILTERED]");
      }
      return event;
    },
  });
}

export async function register() {
  initSentryForRuntime();
}

export const onRequestError = Sentry.captureRequestError;
