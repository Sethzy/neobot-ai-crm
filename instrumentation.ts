/**
 * Next.js instrumentation entrypoint — re-exports from src/ so route files
 * can import via the `@/instrumentation` path alias.
 */
export { langfuseSpanProcessor } from "./src/instrumentation";
