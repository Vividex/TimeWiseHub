-- ============================================================
-- TimeWiseHub — Schema 088: Dedup + hard uniqueness on subjects/topics
-- Bug found during C-3 manual smoke test: ensureSeedSubjects()'s
-- check-then-insert is not atomic, so repeated invocation (root
-- cause of the repeated invocation itself not fully diagnosed --
-- observed ~1150 inserts of each seed subject in ~3 minutes) could
-- create unbounded duplicate subject rows with no defense. This adds
-- a real DB-level uniqueness constraint so duplicate seeding becomes
-- impossible, not just unlikely, and cleans up the existing bad data
-- (confirmed zero topics/sessions reference any subject yet, so no
-- FK breakage risk). Same defensive constraint added to topics for
-- the same class of bug (e.g. rapid double-submit while booking).
-- ============================================================

-- Dedup: keep the earliest row per (scope, name), delete the rest.
delete from public.subjects a
using public.subjects b
where a.id > b.id
  and a.name = b.name
  and coalesce(a.org_id::text, '') = coalesce(b.org_id::text, '')
  and (a.org_id is not null or a.created_by = b.created_by);

create unique index subjects_org_name_uidx on public.subjects (org_id, name) where org_id is not null;
create unique index subjects_solo_name_uidx on public.subjects (created_by, name) where org_id is null;

create unique index topics_subject_year_name_uidx on public.topics (subject_id, year_group, name);
