/**
 * Handles OAuth callback code exchange for Supabase Auth providers.
 * @module app/auth/callback/route
 */
import { NextResponse } from "next/server";

import { buildAnalyticsContext } from "@/lib/analytics/posthog-context";
import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { resolveClientId } from "@/lib/chat/client-id";
import { getSafeNextPath } from "@/lib/auth/browser-redirect";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const authFlow = requestUrl.searchParams.get("auth_flow");
  const nextPath = getSafeNextPath(requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user && (authFlow === "signin" || authFlow === "signup")) {
          const analyticsContext = buildAnalyticsContext({
            email: user.email,
          });
          const clientId = await resolveClientId(supabase, user.id);

          await captureServerEvent({
            distinctId: clientId,
            event: authFlow === "signup" ? "signed_up" : "signed_in",
            properties: {
              method: "google",
              ...analyticsContext,
            },
          });
        }
      } catch (analyticsError) {
        console.error("[analytics] Failed to capture OAuth auth event.", analyticsError);
      }

      return NextResponse.redirect(new URL(nextPath, requestUrl));
    }
  }

  return NextResponse.redirect(new URL("/login?error=oauth_callback", requestUrl));
}
