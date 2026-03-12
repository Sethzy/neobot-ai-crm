/**
 * PostHog client-side initialization via Next.js instrumentation hook.
 * @module instrumentation-client
 */
import posthog from "posthog-js";

import { getAnalyticsEnvironment } from "@/lib/analytics/posthog-context";

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
