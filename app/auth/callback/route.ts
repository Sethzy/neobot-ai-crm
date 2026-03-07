/**
 * Handles OAuth callback code exchange for Supabase Auth providers.
 * @module app/auth/callback/route
 */
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

function getSafeNextPath(nextPath: string | null): string {
  if (!nextPath || !nextPath.startsWith("/")) {
    return "/chat";
  }

  return nextPath;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = getSafeNextPath(requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(nextPath, requestUrl));
    }
  }

  return NextResponse.redirect(new URL("/login?error=oauth_callback", requestUrl));
}
