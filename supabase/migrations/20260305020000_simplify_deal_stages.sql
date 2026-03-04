-- Migration: Simplify deal pipeline from 7 stages to 5.
-- Old: leads, viewing, offer, negotiation, otp, completion, lost
-- New: leads, negotiation, offer, closing, lost
-- Mapping: viewing → negotiation, otp → closing, completion → closing

-- 1. Migrate existing rows to new stage values
UPDATE public.deals SET stage = 'negotiation' WHERE stage = 'viewing';
UPDATE public.deals SET stage = 'closing'     WHERE stage IN ('otp', 'completion');

-- 2. Drop old CHECK and add new one
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_stage_check;
ALTER TABLE public.deals ADD CONSTRAINT deals_stage_check
  CHECK (stage IN ('leads', 'negotiation', 'offer', 'closing', 'lost'));

-- 3. Update crm_config deal_stages for all clients
UPDATE public.crm_config
SET deal_stages = '[
  {"id": "leads", "name": "Leads", "color": "#94a3b8"},
  {"id": "negotiation", "name": "Negotiation", "color": "#f97316"},
  {"id": "offer", "name": "Offer", "color": "#fbbf24"},
  {"id": "closing", "name": "Closing", "color": "#34d399"},
  {"id": "lost", "name": "Lost", "color": "#ef4444"}
]'::jsonb;
