-- ============================================================
-- TimeWiseHub — Schema 086: Tutoring subject tagging
-- Third deep-dive feature for the Tutoring workspace profile.
-- Replaces students.subject (single text) with students.subjects
-- (text[]), backfilled from existing values. Adds sessions.subject
-- (nullable text). Run via Supabase MCP apply_migration
-- (name: tutoring_subject_tagging)
-- ============================================================

alter table public.students add column subjects text[] not null default '{}';

update public.students
set subjects = array[subject]
where subject is not null and subject <> '';

alter table public.students drop column subject;

alter table public.sessions add column subject text;
