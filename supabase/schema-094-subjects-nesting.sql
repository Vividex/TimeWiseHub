-- ============================================================
-- TimeWiseHub — Schema 094: Subject nesting (sub-subjects)
-- Lets any subject (e.g. "Languages") have child subjects (e.g.
-- "French", "Italian") that behave like ordinary subjects — they
-- carry their own topics via the existing topics.subject_id link.
-- No new RLS needed: existing subjects policies key off org_id /
-- created_by, which are unaffected by parent_subject_id. Run via
-- Supabase MCP apply_migration (name: subjects_nesting)
-- ============================================================

alter table public.subjects
  add column parent_subject_id uuid references public.subjects(id) on delete cascade;

create index subjects_parent on public.subjects (parent_subject_id) where parent_subject_id is not null;
