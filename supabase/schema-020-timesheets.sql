-- ============================================================
-- TimeWiseHub - Schema 020: Timesheet approvals
-- Run in Supabase SQL Editor
-- ============================================================

create type public.timesheet_status as enum ('draft', 'submitted', 'approved', 'rejected');

create table public.timesheets (
  id             uuid default gen_random_uuid() primary key,
  user_id        uuid not null references public.profiles on delete cascade,
  org_id         uuid references public.organisations on delete cascade,
  week_start     date not null,
  status         public.timesheet_status not null default 'draft',
  total_seconds  integer not null default 0,
  reviewed_by    uuid references public.profiles,
  reviewed_at    timestamptz,
  review_note    text,
  created_at     timestamptz not null default now(),
  unique(user_id, week_start),
  check (extract(isodow from week_start) = 1),
  check (total_seconds >= 0)
);

alter table public.timesheets enable row level security;

create policy "Users can manage their own timesheets"
  on public.timesheets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Managers can view org member timesheets"
  on public.timesheets for select
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members viewer
      join public.organisation_members target on viewer.org_id = target.org_id
      where viewer.user_id = auth.uid()
        and target.user_id = timesheets.user_id
        and target.org_id = timesheets.org_id
        and viewer.role in ('owner', 'admin', 'manager')
    )
  );

create policy "Managers can update org member timesheets"
  on public.timesheets for update
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members viewer
      join public.organisation_members target on viewer.org_id = target.org_id
      where viewer.user_id = auth.uid()
        and target.user_id = timesheets.user_id
        and target.org_id = timesheets.org_id
        and viewer.role in ('owner', 'admin', 'manager')
    )
  )
  with check (
    org_id is not null and
    exists (
      select 1 from public.organisation_members viewer
      join public.organisation_members target on viewer.org_id = target.org_id
      where viewer.user_id = auth.uid()
        and target.user_id = timesheets.user_id
        and target.org_id = timesheets.org_id
        and viewer.role in ('owner', 'admin', 'manager')
    )
  );

create index timesheets_user_week on public.timesheets (user_id, week_start desc);
create index timesheets_org_status on public.timesheets (org_id, status, week_start desc);
