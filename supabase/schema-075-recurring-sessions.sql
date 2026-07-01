-- supabase/schema-075-recurring-sessions.sql
-- Recurring sessions: session_series definition + sessions.series_id link

create type public.session_recurrence_interval as enum ('weekly', 'fortnightly', 'monthly');

create table public.session_series (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references public.clients on delete cascade,
  org_id              uuid references public.organisations on delete cascade,
  created_by          uuid not null references public.profiles on delete cascade,
  title               text not null,
  duration_minutes    integer not null default 60,
  recurrence_interval public.session_recurrence_interval not null,
  next_scheduled_at   timestamptz not null,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

alter table public.session_series enable row level security;

create policy "Org members can view session series"
  on public.session_series for select
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = session_series.org_id and om.user_id = auth.uid()
    )
  );

create policy "Org admins can manage session series"
  on public.session_series for all
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = session_series.org_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

create policy "Creator can manage own session series"
  on public.session_series for all
  using (created_by = auth.uid());

create index session_series_client on public.session_series (client_id);
create index session_series_active on public.session_series (is_active) where is_active = true;

alter table public.sessions
  add column series_id uuid references public.session_series(id) on delete set null;

create index sessions_series on public.sessions (series_id) where series_id is not null;
