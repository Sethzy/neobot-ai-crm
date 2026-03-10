-- Stripe billing fields live on the tenant root row for simple per-client plan state.

ALTER TABLE public.clients
  ADD COLUMN stripe_customer_id TEXT UNIQUE,
  ADD COLUMN stripe_subscription_id TEXT UNIQUE,
  ADD COLUMN stripe_product_id TEXT,
  ADD COLUMN plan_name VARCHAR(50),
  ADD COLUMN subscription_status VARCHAR(20);

COMMENT ON COLUMN public.clients.stripe_customer_id IS
  'Stripe customer id for this client. Populated before or during the first checkout.';
COMMENT ON COLUMN public.clients.stripe_subscription_id IS
  'Active Stripe subscription id for this client. Cleared when billing ends.';
COMMENT ON COLUMN public.clients.stripe_product_id IS
  'Current Stripe product id backing the client plan.';
COMMENT ON COLUMN public.clients.plan_name IS
  'Human-readable plan label shown in the product UI (for example Free, Pro, or Max).';
COMMENT ON COLUMN public.clients.subscription_status IS
  'Latest Stripe subscription status mirrored from webhook events.';
