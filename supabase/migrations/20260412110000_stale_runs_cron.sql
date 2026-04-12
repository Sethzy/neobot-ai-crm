-- Move stale-run cleanup off the chat hot path and into pg_cron.

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create or replace function public.sweep_stale_runs()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.runs
  set status = 'failed',
      completed_at = now()
  where status = 'running'
    and created_at < now() - make_interval(mins => 15);
$$;

comment on function public.sweep_stale_runs()
is 'Background cron sweep for stale running rows in public.runs.';

select cron.schedule(
  'sweep-stale-runs',
  '*/5 * * * *',
  $$select public.sweep_stale_runs()$$
);
