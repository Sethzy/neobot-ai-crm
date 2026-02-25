-- supabase/migrations/20260103000000_create_report_history.sql
-- Report history table for audit trail of generated reports

create table report_history (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,

  -- Report identification
  report_type text not null check (report_type in (
    'data_export',
    'ai_summary',
    'ai_reconciliation',
    'ai_custom'
  )),
  name text not null,

  -- Generation details
  prompt text,
  file_path text not null,
  file_size_bytes int,

  -- Data snapshot info
  splits_count int not null,
  tags_included text[] not null,

  -- Timestamps and ownership
  generated_at timestamptz not null default now(),
  generated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table report_history enable row level security;

-- Users can only see reports for cases they own (uses created_by, not user_id)
create policy "Users see own reports"
  on report_history for select
  using (
    case_id in (select id from cases where created_by = auth.uid())
  );

-- Users can only insert reports for cases they own
create policy "Users insert own reports"
  on report_history for insert
  with check (
    case_id in (select id from cases where created_by = auth.uid())
  );

-- Indexes
create index idx_report_history_case_id on report_history(case_id);
create index idx_report_history_generated_by on report_history(generated_by);
create index idx_report_history_generated_at on report_history(generated_at desc);

-- Updated_at trigger
create trigger set_report_history_updated_at
  before update on report_history
  for each row execute function update_updated_at_column();
