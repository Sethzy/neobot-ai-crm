/**
 * Shared billing-flow error helpers for Stripe Checkout and Customer Portal redirects.
 * @module lib/stripe/billing-errors
 */

export const billingErrorCodes = {
  alreadySubscribed: "already-subscribed",
  error: "error",
  invalidPlan: "invalid-plan",
  portalError: "portal-error",
} as const;

export type BillingErrorCode =
  (typeof billingErrorCodes)[keyof typeof billingErrorCodes];

export class BillingFlowError extends Error {
  code: BillingErrorCode;

  constructor(code: BillingErrorCode, message: string) {
    super(message);
    this.name = "BillingFlowError";
    this.code = code;
  }
}

export function isBillingFlowError(error: unknown): error is BillingFlowError {
  return error instanceof BillingFlowError;
}

export function isNextRedirectError(
  error: unknown,
): error is Error & { digest: string } {
  const digest = (error as Error & { digest?: unknown })?.digest;

  return (
    error instanceof Error &&
    typeof digest === "string" &&
    digest.startsWith("NEXT_REDIRECT")
  );
}
