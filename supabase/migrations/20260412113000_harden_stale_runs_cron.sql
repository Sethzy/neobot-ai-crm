-- Harden the stale-runs cron sweep and keep the recurring predicate cheap.

revoke execute on function public.sweep_stale_runs() from public;
revoke execute on function public.sweep_stale_runs() from anon;
revoke execute on function public.sweep_stale_runs() from authenticated;
grant execute on function public.sweep_stale_runs() to postgres;

create index if not exists idx_runs_running_created_at
  on public.runs (created_at)
  where status = 'running';
