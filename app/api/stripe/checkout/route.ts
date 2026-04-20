/**
 * Stripe Checkout success fallback route.
 * Keeps the user-facing redirect flow resilient while webhooks remain the source of truth.
 * @module app/api/stripe/checkout/route
 */
import { NextResponse } from "next/server";

import { syncBillingStateFromCheckoutSession } from "@/lib/stripe/stripe";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const sessionId = requestUrl.searchParams.get("session_id")?.trim();

  if (!sessionId) {
    return NextResponse.redirect(new URL("/pricing", requestUrl));
  }

  try {
    await syncBillingStateFromCheckoutSession(sessionId);
    return NextResponse.redirect(new URL("/settings/workspace/billing?billing=success", requestUrl));
  } catch (error) {
    console.error("[stripe] Checkout fallback sync failed.", error);
    return NextResponse.redirect(new URL("/pricing?billing=error", requestUrl));
  }
}
