/** Sentry server-side initialization. */
import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,

    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
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
