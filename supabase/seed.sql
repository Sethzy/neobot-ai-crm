-- PR5 local seed data for CRM tables.
-- Local development only. Do not run this file against production databases.

DO $$
DECLARE
  v_client_id UUID;
  v_contact_john UUID := 'a0000000-0000-0000-0000-000000000001';
  v_contact_jane UUID := 'a0000000-0000-0000-0000-000000000002';
  v_contact_ahmad UUID := 'a0000000-0000-0000-0000-000000000003';
  v_contact_mei UUID := 'a0000000-0000-0000-0000-000000000004';
  v_contact_david UUID := 'a0000000-0000-0000-0000-000000000005';
  v_deal_orchard UUID := 'b0000000-0000-0000-0000-000000000001';
  v_deal_bukit UUID := 'b0000000-0000-0000-0000-000000000002';
  v_deal_marine UUID := 'b0000000-0000-0000-0000-000000000003';
  v_deal_tanjong UUID := 'b0000000-0000-0000-0000-000000000004';
BEGIN
  SELECT client_id INTO v_client_id FROM public.clients ORDER BY created_at ASC LIMIT 1;

  IF v_client_id IS NULL THEN
    RAISE NOTICE 'No clients found. Skipping CRM seed.';
    RETURN;
  END IF;

  INSERT INTO public.contacts (contact_id, client_id, first_name, last_name, email, phone, type, notes)
  VALUES
    (v_contact_john, v_client_id, 'John', 'Tan', 'john.tan@email.com', '+6591234567', 'buyer', 'Looking for 3BR condo in D15. Budget 1.5-2M.'),
    (v_contact_jane, v_client_id, 'Jane', 'Lim', 'jane.lim@company.com', '+6598765432', 'seller', 'Selling HDB in Toa Payoh. Upgrading to condo.'),
    (v_contact_ahmad, v_client_id, 'Ahmad', 'Ibrahim', 'ahmad.i@email.com', '+6590001111', 'landlord', 'Owns 2 condos in Marine Parade. Looking for tenants.'),
    (v_contact_mei, v_client_id, 'Mei Ling', 'Wong', NULL, '+6592223333', 'tenant', 'Corporate relocation from HK. Budget $5k/mo.'),
    (v_contact_david, v_client_id, 'David', 'Chen', 'david.chen@realty.sg', '+6594445555', 'agent', 'Co-broke partner at ERA. Specializes in D10.')
  ON CONFLICT (contact_id) DO NOTHING;

  INSERT INTO public.deals (deal_id, client_id, contact_id, address, stage, price, notes)
  VALUES
    (v_deal_orchard, v_client_id, v_contact_john, '88 Orchard Boulevard, #12-05', 'negotiation', 1800000, 'Scheduled 2 viewings. Client likes the layout.'),
    (v_deal_bukit, v_client_id, v_contact_jane, '456 Bukit Timah Road, #04-12', 'leads', 850000, 'HDB valuation pending. Seller motivated.'),
    (v_deal_marine, v_client_id, v_contact_ahmad, '10 Marine Parade Road, #08-03', 'offer', 4500, 'Rental listing. Tenant interested at asking price.'),
    (v_deal_tanjong, v_client_id, v_contact_john, '22 Tanjong Rhu Road, #15-01', 'negotiation', 2200000, 'Counter-offer at 2.1M. Seller wants 2.25M.')
  ON CONFLICT (deal_id) DO NOTHING;

  INSERT INTO public.interactions (client_id, contact_id, deal_id, type, summary, occurred_at)
  VALUES
    (v_client_id, v_contact_john, v_deal_orchard, 'call', 'Discussed viewing schedule for Orchard Blvd unit. Confirmed Saturday 2pm.', now() - interval '3 days'),
    (v_client_id, v_contact_john, v_deal_orchard, 'viewing', 'Showed 88 Orchard Blvd #12-05. Client liked the view but concerned about noise.', now() - interval '1 day'),
    (v_client_id, v_contact_jane, v_deal_bukit, 'meeting', 'Initial meeting at HDB. Discussed timeline and pricing expectations.', now() - interval '5 days'),
    (v_client_id, v_contact_ahmad, v_deal_marine, 'email', 'Sent rental listing details and tenancy agreement template.', now() - interval '2 days'),
    (v_client_id, v_contact_mei, NULL, 'call', 'Intro call. Corporate relocation from HK. Needs 2BR near MRT. Budget $5k/mo.', now() - interval '7 days'),
    (v_client_id, v_contact_david, NULL, 'message', 'WhatsApp: Confirmed co-broke arrangement for D10 listings.', now() - interval '4 days');

  INSERT INTO public.crm_tasks (client_id, contact_id, deal_id, title, description, status, due_date)
  VALUES
    (v_client_id, v_contact_john, v_deal_orchard, 'Follow up on Orchard Blvd viewing', 'Call John about noise concerns. Check decibel levels.', 'open', now() + interval '2 days'),
    (v_client_id, v_contact_jane, v_deal_bukit, 'Get HDB valuation report', 'Request valuation from HDB. Need for listing price.', 'open', now() + interval '5 days'),
    (v_client_id, v_contact_mei, NULL, 'Send rental listings to Mei Ling', 'Compile 2BR listings near MRT under $5k.', 'completed', now() - interval '1 day');

  INSERT INTO public.crm_config (
    client_id,
    deal_label,
    deal_stages,
    contact_types,
    interaction_types,
    deal_contact_roles,
    deal_custom_fields,
    contact_custom_fields,
    task_custom_fields
  )
  VALUES (
    v_client_id,
    'Deal',
    '["leads", "negotiation", "offer", "closing", "lost"]'::jsonb,
    '["buyer", "seller", "landlord", "tenant", "agent", "other"]'::jsonb,
    '["call", "meeting", "email", "message", "viewing", "note"]'::jsonb,
    '["buyer", "seller", "agent", "other"]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  )
  ON CONFLICT (client_id) DO NOTHING;
END $$;
