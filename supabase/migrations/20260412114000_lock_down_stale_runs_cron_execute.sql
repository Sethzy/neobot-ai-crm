-- Restrict direct execution of the stale-runs sweep to postgres only.

revoke execute on function public.sweep_stale_runs() from service_role;
