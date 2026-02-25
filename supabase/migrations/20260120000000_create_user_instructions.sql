-- Create user_instructions table for capturing user feedback and preferences
create table user_instructions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid references cases(id) on delete set null,
  title text not null,
  description text not null,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table user_instructions enable row level security;

-- Users can only see/manage their own instructions
create policy "Users can manage own instructions"
  on user_instructions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for faster queries by user
create index idx_user_instructions_user_id on user_instructions(user_id);

-- Index for case_id lookups
create index idx_user_instructions_case_id on user_instructions(case_id);
