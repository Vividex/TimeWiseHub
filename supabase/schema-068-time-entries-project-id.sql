-- supabase/schema-068-time-entries-project-id.sql
-- Add project_id to time_entries so clock-in can be linked to a project
-- rather than a specific task. task_id is retained for backward compatibility.

ALTER TABLE public.time_entries
  ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX time_entries_project_id ON public.time_entries(project_id);
