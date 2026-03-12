/**
 * Browser helpers for delaying auth analytics until a client-scoped identity exists.
 * @module lib/analytics/posthog-auth-events
 */
import type { SupabaseClient, User } from "@supabase/supabase-js";
import posthog from "posthog-js";

import { buildAnalyticsContext } from "@/lib/analytics/posthog-context";
import { resolveClientId } from "@/lib/chat/client-id";
import type { Database } from "@/types/database";

const pendingAuthEventStorageKey = "sunder:pending-posthog-auth-event";

export type PendingPostHogAuthEvent = {
  event: "signed_in" | "signed_up";
  method: "email";
};

function getDisplayName(user: Pick<User, "user_metadata">): string | undefined {
  if (typeof user.user_metadata?.display_name === "string") {
    return user.user_metadata.display_name;
  }

  if (typeof user.user_metadata?.full_name === "string") {
    return user.user_metadata.full_name;
  }

  return undefined;
}

/** Stores an email auth event until the app has identified the current `clientId`. */
export function queuePendingPostHogAuthEvent(event: PendingPostHogAuthEvent): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(pendingAuthEventStorageKey, JSON.stringify(event));
}

/** Reads and clears the next queued email auth event, if one exists. */
export function consumePendingPostHogAuthEvent(): PendingPostHogAuthEvent | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(pendingAuthEventStorageKey);
  if (!rawValue) {
    return null;
  }

  window.sessionStorage.removeItem(pendingAuthEventStorageKey);

  try {
    const parsedValue = JSON.parse(rawValue) as Partial<PendingPostHogAuthEvent>;

    if (
      (parsedValue.event === "signed_in" || parsedValue.event === "signed_up") &&
      parsedValue.method === "email"
    ) {
      return parsedValue as PendingPostHogAuthEvent;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Captures an email auth event against the resolved `clientId`, or queues it
 * until the app can identify the signed-in client later in the session.
 */
export async function captureOrQueueEmailAuthEvent(args: {
  event: PendingPostHogAuthEvent["event"];
  supabase: SupabaseClient<Database>;
  user: Pick<User, "email" | "id" | "user_metadata">;
}): Promise<void> {
  try {
    const clientId = await resolveClientId(args.supabase, args.user.id);
    const analyticsContext = buildAnalyticsContext({
      email: args.user.email,
    });

    posthog.identify(clientId, {
      email: args.user.email,
      name: getDisplayName(args.user),
      ...analyticsContext,
    });
    posthog.register(analyticsContext);
    posthog.capture(args.event, {
      method: "email",
      ...analyticsContext,
    });
  } catch {
    queuePendingPostHogAuthEvent({
      event: args.event,
      method: "email",
    });
  }
}
