-- Cache Stripe subscription period info on the client row so the in-app
-- billing page can render renewal/trial/cancel dates without round-tripping
-- to Stripe on every page load. Mirrored from webhook events.

ALTER TABLE public.clients
  ADD COLUMN current_period_end TIMESTAMPTZ,
  ADD COLUMN cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clients.current_period_end IS
  'End of the current Stripe billing period. When trialing this is the trial-end timestamp; when active this is the next renewal. Null when no paid subscription exists.';

COMMENT ON COLUMN public.clients.cancel_at_period_end IS
  'True when the customer has scheduled a cancellation that takes effect at current_period_end. Drives the "Cancels on {date}" copy on the billing page.';
