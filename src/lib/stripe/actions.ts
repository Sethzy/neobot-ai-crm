/**
 * Server Actions for Stripe Checkout and Customer Portal redirects.
 * @module lib/stripe/actions
 */
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createCheckoutSession, createCustomerPortalSession } from "./stripe";

const checkoutActionSchema = z.object({
  priceId: z.string().min(1, "A Stripe price id is required."),
});

/**
 * Creates a hosted Stripe Checkout session for the selected paid plan
 * and redirects the browser to Stripe.
 */
export async function checkoutAction(formData: FormData): Promise<void> {
  const parsedInput = checkoutActionSchema.safeParse({
    priceId: formData.get("priceId"),
  });

  if (!parsedInput.success) {
    throw new Error("Invalid billing plan selection.");
  }

  const checkoutUrl = await createCheckoutSession(parsedInput.data.priceId);
  redirect(checkoutUrl);
}

/**
 * Creates a Stripe Customer Portal session for the current client
 * and redirects the browser to the hosted portal.
 */
export async function customerPortalAction(): Promise<void> {
  const portalUrl = await createCustomerPortalSession();
  redirect(portalUrl);
}
