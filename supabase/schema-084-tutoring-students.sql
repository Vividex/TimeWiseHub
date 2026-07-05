-- ============================================================
-- TimeWiseHub — Schema 084: Tutoring Student entity
-- First deep-dive feature for the Tutoring workspace profile. Students
-- are learners linked to a Client (the paying parent). sessions.student_id
-- is nullable and additive -- every non-tutoring session keeps it null and
-- behaves exactly as before. Run via Supabase MCP apply_migration
-- (name: tutoring_students)
-- ============================================================

create table public.students (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients on delete cascade,
  name        text not null,
  subject     text,
  notes       text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.students enable row level security;

create policy "Owners can manage students of their own clients"
  on public.students for all
  using (
    exists (
      select 1 from public.clients c
      where c.id = students.client_id and c.owner_id = auth.uid()
    )
  );

create policy "Org members can view students of org clients"
  on public.students for select
  using (
    exists (
      select 1 from public.clients c
      join public.organisation_members om on om.org_id = c.org_id
      where c.id = students.client_id and om.user_id = auth.uid()
    )
  );

create policy "Org admins can manage students of org clients"
  on public.students for all
  using (
    exists (
      select 1 from public.clients c
      join public.organisation_members om on om.org_id = c.org_id
      where c.id = students.client_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

alter table public.sessions
  add column student_id uuid references public.students on delete set null;
