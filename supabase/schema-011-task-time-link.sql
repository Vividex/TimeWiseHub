-- ============================================================
-- TimeWiseHub — Schema 011: Link time entries to tasks
-- Run in Supabase SQL Editor
-- ============================================================

alter table public.time_entries
  add column task_id uuid references public.tasks(id) on delete set null;

create index time_entries_task on public.time_entries (task_id) where task_id is not null;
