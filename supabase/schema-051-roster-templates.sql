-- ============================================================
-- TimeWiseHub — Schema 051: Roster shift templates
-- ============================================================

create table public.roster_shift_templates (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  day_of_week  smallint not null check (day_of_week between 0 and 6), -- 0=Sun,1=Mon…6=Sat (JS getUTCDay())
  start_time   time not null,
  end_time     time not null,
  notes        text,
  created_at   timestamptz not null default now(),
  unique (org_id, user_id, day_of_week)
);

alter table public.roster_shift_templates enable row level security;

create policy "employees read own templates"
  on public.roster_shift_templates for select
  using (user_id = auth.uid());

create policy "managers read org templates"
  on public.roster_shift_templates for select
  using (
    org_id in (
      select org_id from public.organisation_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'manager')
    )
  );

create policy "admins manage templates"
  on public.roster_shift_templates for all
  using (
    org_id in (
      select org_id from public.organisation_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  )
  with check (
    org_id in (
      select org_id from public.organisation_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create index roster_templates_org on public.roster_shift_templates (org_id, user_id);
