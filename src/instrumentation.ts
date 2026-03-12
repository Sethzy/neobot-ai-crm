/**
 * Next.js instrumentation file — auto-loaded on app startup.
 * Initializes OpenTelemetry with Langfuse for LLM call tracing.
 * @see https://langfuse.com/integrations/frameworks/vercel-ai-sdk
 */
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

export const langfuseSpanProcessor = new LangfuseSpanProcessor();

const tracerProvider = new NodeTracerProvider({
  spanProcessors: [langfuseSpanProcessor],
});

tracerProvider.register();
