-- PR5b: enforce tenant-safe CRM foreign key integrity.
-- Prevents cross-tenant linkage for contact_id/deal_id relations.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.deals AS d
    JOIN public.contacts AS c
      ON c.contact_id = d.contact_id
    WHERE d.contact_id IS NOT NULL
      AND d.client_id <> c.client_id
  ) THEN
    RAISE EXCEPTION 'Cross-tenant data detected: deals.contact_id does not match deals.client_id.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.interactions AS i
    JOIN public.contacts AS c
      ON c.contact_id = i.contact_id
    WHERE i.client_id <> c.client_id
  ) THEN
    RAISE EXCEPTION 'Cross-tenant data detected: interactions.contact_id does not match interactions.client_id.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.interactions AS i
    JOIN public.deals AS d
      ON d.deal_id = i.deal_id
    WHERE i.deal_id IS NOT NULL
      AND i.client_id <> d.client_id
  ) THEN
    RAISE EXCEPTION 'Cross-tenant data detected: interactions.deal_id does not match interactions.client_id.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.crm_tasks AS t
    JOIN public.contacts AS c
      ON c.contact_id = t.contact_id
    WHERE t.contact_id IS NOT NULL
      AND t.client_id <> c.client_id
  ) THEN
    RAISE EXCEPTION 'Cross-tenant data detected: crm_tasks.contact_id does not match crm_tasks.client_id.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.crm_tasks AS t
    JOIN public.deals AS d
      ON d.deal_id = t.deal_id
    WHERE t.deal_id IS NOT NULL
      AND t.client_id <> d.client_id
  ) THEN
    RAISE EXCEPTION 'Cross-tenant data detected: crm_tasks.deal_id does not match crm_tasks.client_id.';
  END IF;
END $$;

-- Referenced-side composite uniqueness for tenant-scoped FKs.
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_client_contact_unique UNIQUE (client_id, contact_id);

ALTER TABLE public.deals
  ADD CONSTRAINT deals_client_deal_unique UNIQUE (client_id, deal_id);

-- Referencing-side indexes for composite FK operations and common linked lookups.
CREATE INDEX idx_deals_client_contact_id
  ON public.deals(client_id, contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX idx_interactions_client_contact_id
  ON public.interactions(client_id, contact_id);

CREATE INDEX idx_interactions_client_deal_id
  ON public.interactions(client_id, deal_id)
  WHERE deal_id IS NOT NULL;

CREATE INDEX idx_crm_tasks_client_contact_id
  ON public.crm_tasks(client_id, contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX idx_crm_tasks_client_deal_id
  ON public.crm_tasks(client_id, deal_id)
  WHERE deal_id IS NOT NULL;

-- Composite FKs enforce same-tenant linkage.
-- Existing single-column FKs remain for their ON DELETE behavior.
ALTER TABLE public.deals
  ADD CONSTRAINT deals_client_contact_tenant_fkey
  FOREIGN KEY (client_id, contact_id)
  REFERENCES public.contacts(client_id, contact_id)
  ON UPDATE CASCADE
  ON DELETE NO ACTION;

ALTER TABLE public.interactions
  ADD CONSTRAINT interactions_client_contact_tenant_fkey
  FOREIGN KEY (client_id, contact_id)
  REFERENCES public.contacts(client_id, contact_id)
  ON UPDATE CASCADE
  ON DELETE NO ACTION;

ALTER TABLE public.interactions
  ADD CONSTRAINT interactions_client_deal_tenant_fkey
  FOREIGN KEY (client_id, deal_id)
  REFERENCES public.deals(client_id, deal_id)
  ON UPDATE CASCADE
  ON DELETE NO ACTION;

ALTER TABLE public.crm_tasks
  ADD CONSTRAINT crm_tasks_client_contact_tenant_fkey
  FOREIGN KEY (client_id, contact_id)
  REFERENCES public.contacts(client_id, contact_id)
  ON UPDATE CASCADE
  ON DELETE NO ACTION;

ALTER TABLE public.crm_tasks
  ADD CONSTRAINT crm_tasks_client_deal_tenant_fkey
  FOREIGN KEY (client_id, deal_id)
  REFERENCES public.deals(client_id, deal_id)
  ON UPDATE CASCADE
  ON DELETE NO ACTION;
