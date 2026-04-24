-- Persist raw Telegram webhook payloads before handing work to `after()`.
-- This lets us recover updates if background processing crashes after the
-- webhook has already acknowledged Telegram.

create table if not exists public.telegram_inbound_updates (
  update_id bigint primary key,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

alter table public.telegram_inbound_updates enable row level security;
