/**
 * Stripe webhook endpoint for subscription provisioning and lifecycle sync.
 * @module app/api/stripe/webhook/route
 */
import Stripe from "stripe";

import {
  getStripeClient,
  syncBillingStateFromDeletedSubscription,
  syncBillingStateFromSubscriptionId,
} from "@/lib/stripe/stripe";

export const runtime = "nodejs";
export const maxDuration = 60;

function getWebhookSecret(): string {
  const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();

  if (!webhookSecret) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET.");
  }

  return webhookSecret;
}

export async function POST(request: Request): Promise<Response> {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return Response.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = getStripeClient().webhooks.constructEvent(payload, signature, getWebhookSecret());
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? `Webhook signature verification failed: ${error.message}`
            : "Webhook signature verification failed.",
      },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session & {
          subscription?: string | { id: string } | null;
        };
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id ?? null;

        if (subscriptionId) {
          await syncBillingStateFromSubscriptionId(subscriptionId);
        }
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice & {
          subscription?: string | { id: string } | null;
        };
        const subscriptionId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id ?? null;

        if (subscriptionId) {
          await syncBillingStateFromSubscriptionId(subscriptionId);
        }
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncBillingStateFromSubscriptionId(subscription.id);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncBillingStateFromDeletedSubscription(subscription);
        break;
      }
      default:
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Stripe webhook error.";
    return Response.json({ error: message }, { status: 500 });
  }

  return Response.json({ received: true });
}
