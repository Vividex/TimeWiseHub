-- ============================================================
-- TimeWiseHub — Schema 087: Tutoring year group / subject / topic
-- Fourth deep-dive feature for the Tutoring workspace profile.
-- Replaces sessions.subject / students.subjects (free-text, from
-- schema-086) with a structured hierarchy: subjects (seeded +
-- tutor-extensible, org-wide), topics (tutor-created, scoped per
-- subject+year-group). Year groups are a fixed code constant, no
-- table. Run via Supabase MCP apply_migration
-- (name: tutoring_year_subject_topic)
-- ============================================================

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organisations on delete cascade,
  created_by uuid not null references public.profiles on delete cascade,
  name text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.subjects enable row level security;

create policy "Org members can view subjects" on public.subjects for select
  using (org_id is not null and exists (
    select 1 from public.organisation_members om
    where om.org_id = subjects.org_id and om.user_id = auth.uid()
  ));

create policy "Org admins can manage subjects" on public.subjects for all
  using (org_id is not null and exists (
    select 1 from public.organisation_members om
    where om.org_id = subjects.org_id and om.user_id = auth.uid() and om.role in ('owner','admin')
  ));

create policy "Creator can manage own subjects" on public.subjects for all
  using (created_by = auth.uid());

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects on delete cascade,
  year_group text not null,
  created_by uuid not null references public.profiles on delete cascade,
  name text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.topics enable row level security;

create policy "Org members can view topics" on public.topics for select
  using (exists (
    select 1 from public.subjects s
    join public.organisation_members om on om.org_id = s.org_id
    where s.id = topics.subject_id and om.user_id = auth.uid()
  ));

create policy "Org admins can manage topics" on public.topics for all
  using (exists (
    select 1 from public.subjects s
    join public.organisation_members om on om.org_id = s.org_id
    where s.id = topics.subject_id and om.user_id = auth.uid() and om.role in ('owner','admin')
  ));

create policy "Creator can manage own topics" on public.topics for all
  using (created_by = auth.uid());

create index topics_subject_year on public.topics (subject_id, year_group);

alter table public.sessions drop column subject;
alter table public.sessions add column year_group text;
alter table public.sessions add column subject_id uuid references public.subjects on delete set null;
alter table public.sessions add column topic_id uuid references public.topics on delete set null;

alter table public.students drop column subjects;
