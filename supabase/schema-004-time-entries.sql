-- ============================================================
-- TimeWiseHub — Schema 004: Time entries
-- Run in Supabase SQL Editor
-- ============================================================

create table public.time_entries (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid not null references public.profiles on delete cascade,
  description      text,
  started_at       timestamptz not null,
  ended_at         timestamptz,
  duration_seconds integer generated always as (
    extract(epoch from (ended_at - started_at))::integer
  ) stored,
  created_at       timestamptz not null default now()
);

alter table public.time_entries enable row level security;

-- Users can manage their own entries
create policy "Users can view their own time entries"
  on public.time_entries for select
  using (auth.uid() = user_id);

create policy "Users can insert their own time entries"
  on public.time_entries for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own time entries"
  on public.time_entries for update
  using (auth.uid() = user_id);

create policy "Users can delete their own time entries"
  on public.time_entries for delete
  using (auth.uid() = user_id);

-- Managers, admins, and owners can view entries for users in their org
create policy "Managers can view org member time entries"
  on public.time_entries for select
  using (
    exists (
      select 1 from public.organisation_members viewer
      join public.organisation_members target
        on viewer.org_id = target.org_id
      where viewer.user_id = auth.uid()
        and target.user_id = time_entries.user_id
        and viewer.role in ('owner', 'admin', 'manager')
    )
  );

-- Index for fast per-user date range queries
create index time_entries_user_started on public.time_entries (user_id, started_at desc);
