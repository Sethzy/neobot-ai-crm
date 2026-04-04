-- Migrate task statuses from (open, completed) to (todo, in_progress, done).

-- 1. Drop the old constraint first (allows writing new values)
ALTER TABLE public.crm_tasks DROP CONSTRAINT IF EXISTS crm_tasks_status_check;

-- 2. Migrate existing data
UPDATE public.crm_tasks SET status = 'todo' WHERE status = 'open';
UPDATE public.crm_tasks SET status = 'done' WHERE status = 'completed';

-- 3. Add the new constraint
ALTER TABLE public.crm_tasks ADD CONSTRAINT crm_tasks_status_check
  CHECK (status IN ('todo', 'in_progress', 'done'));

-- 4. Update the default
ALTER TABLE public.crm_tasks ALTER COLUMN status SET DEFAULT 'todo';
