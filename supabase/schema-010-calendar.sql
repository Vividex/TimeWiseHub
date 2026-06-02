-- ============================================================
-- TimeWiseHub — Schema 010: Calendar events
-- Run in Supabase SQL Editor
-- ============================================================

create table public.calendar_events (
  id          uuid default gen_random_uuid() primary key,
  created_by  uuid not null references public.profiles on delete cascade,
  org_id      uuid references public.organisations on delete cascade,
  title       text not null,
  description text,
  start_at    timestamptz not null,
  end_at      timestamptz,
  all_day     boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.calendar_events enable row level security;

create policy "Users can manage their own events"
  on public.calendar_events for all
  using (auth.uid() = created_by);

create policy "Org members can view shared org events"
  on public.calendar_events for select
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = calendar_events.org_id
      and om.user_id = auth.uid()
    )
  );

create policy "Org admins can manage org events"
  on public.calendar_events for all
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = calendar_events.org_id
      and om.user_id = auth.uid()
      and om.role in ('owner', 'admin')
    )
  );

create index calendar_events_user  on public.calendar_events (created_by, start_at);
create index calendar_events_org   on public.calendar_events (org_id, start_at);
