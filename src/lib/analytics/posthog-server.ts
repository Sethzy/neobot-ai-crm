/**
 * PostHog server-side helpers for route handlers, server actions, and tools.
 * @module lib/analytics/posthog-server
 */
import { PostHog, type EventMessage } from "posthog-node";

import { getAnalyticsEnvironment } from "@/lib/analytics/posthog-context";
import { createConsoleLogger } from "@/lib/logger";

const console = createConsoleLogger();

let client: PostHog | null = null;

function getPostHogHost(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";
}

/** Returns a shared PostHog server client or `null` when analytics is disabled. */
export function getPostHogServer(): PostHog | null {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();

  if (!posthogKey) {
    return null;
  }

  if (!client) {
    client = new PostHog(posthogKey, {
      host: getPostHogHost(),
    });
  }

  return client;
}

function withDefaultAnalyticsProperties(event: EventMessage): EventMessage {
  return {
    ...event,
    properties: {
      environment: getAnalyticsEnvironment(),
      ...(event.properties ?? {}),
    },
  };
}

/**
 * Captures one analytics event immediately. This matches PostHog's current
 * serverless guidance better than the older flush interval configuration.
 */
export async function captureServerEvent(event: EventMessage): Promise<void> {
  const posthog = getPostHogServer();

  if (!posthog) {
    return;
  }

  try {
    await posthog.captureImmediate(withDefaultAnalyticsProperties(event));
  } catch (error) {
    console.error("[analytics] Failed to capture PostHog event.", error);
  }
}

/**
 * Captures multiple events and flushes once to avoid a network round-trip per event.
 */
export async function captureServerEvents(events: EventMessage[]): Promise<void> {
  if (events.length === 0) {
    return;
  }

  const posthog = getPostHogServer();

  if (!posthog) {
    return;
  }

  try {
    if (events.length === 1) {
      await posthog.captureImmediate(withDefaultAnalyticsProperties(events[0]));
      return;
    }

    for (const event of events) {
      posthog.capture(withDefaultAnalyticsProperties(event));
    }

    await posthog.flush();
  } catch (error) {
    console.error("[analytics] Failed to capture PostHog events.", error);
  }
}
