/**
 * Next.js instrumentation file — auto-loaded on app startup.
 * Initializes OpenTelemetry with Langfuse for LLM call tracing.
 * @see https://langfuse.com/integrations/frameworks/vercel-ai-sdk
 */
import * as Sentry from "@sentry/nextjs";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

export const langfuseSpanProcessor = new LangfuseSpanProcessor();

let hasRegisteredLangfuseTracing = false;
let hasInitializedSentry = false;

export function registerLangfuseTracing() {
  if (hasRegisteredLangfuseTracing) {
    return;
  }

  hasRegisteredLangfuseTracing = true;

  const tracerProvider = new NodeTracerProvider({
    spanProcessors: [langfuseSpanProcessor],
  });

  tracerProvider.register();
}

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
  if (process.env.NEXT_RUNTIME === "nodejs") {
    registerLangfuseTracing();
  }

  initSentryForRuntime();
}

export const onRequestError = Sentry.captureRequestError;
