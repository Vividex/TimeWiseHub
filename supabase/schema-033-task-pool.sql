-- ============================================================
-- TimeWiseHub — Schema 033: Task pool performance index
-- Run in Supabase SQL Editor or via supabase db push
-- ============================================================

-- Partial index to speed up the "available tasks" pool query
CREATE INDEX IF NOT EXISTS tasks_pool
  ON public.tasks (project_id, created_at)
  WHERE assignee_id IS NULL AND status <> 'done';
