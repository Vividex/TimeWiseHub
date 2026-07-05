-- ============================================================
-- TimeWiseHub — Schema 090: Tutoring progress report notes
-- Sixth deep-dive feature for the Tutoring workspace profile.
-- Appropriates the existing progress_notes feature (rather than a
-- new table) by adding student_id (for multi-child families) and
-- sent_to_parent_at (send-to-parent tracking). Run via Supabase MCP
-- apply_migration (name: tutoring_progress_report_notes)
-- ============================================================

alter table public.progress_notes add column student_id uuid references public.students on delete set null;
alter table public.progress_notes add column sent_to_parent_at timestamptz;

create index progress_notes_student on public.progress_notes (student_id) where student_id is not null;
