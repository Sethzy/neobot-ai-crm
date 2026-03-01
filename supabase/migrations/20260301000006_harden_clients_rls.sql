-- PR3 hardening: clients table should be read-only for authenticated users in v1.
-- If an earlier local revision created an update policy, drop it.

DROP POLICY IF EXISTS clients_update_own ON public.clients;
