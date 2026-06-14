-- ============================================================
-- TimeWiseHub — Schema 055: Video calls
-- ============================================================

create table if not exists scheduled_calls (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid references organisations on delete cascade not null,
  title            text not null,
  starts_at        timestamptz,
  ends_at          timestamptz,
  created_by       uuid references auth.users on delete cascade not null,
  daily_room_name  text,
  room_url         text,
  reminder_sent    boolean not null default false,
  created_at       timestamptz not null default now()
);

alter table scheduled_calls enable row level security;

-- Org members can view calls for their org
create policy "org members can view calls"
  on scheduled_calls for select
  using (
    exists (
      select 1 from organisation_members
      where organisation_members.org_id = scheduled_calls.org_id
        and organisation_members.user_id = auth.uid()
    )
  );

-- Owner/admin/manager can create/update/delete
create policy "managers can manage calls"
  on scheduled_calls for all
  using (
    exists (
      select 1 from organisation_members
      where organisation_members.org_id = scheduled_calls.org_id
        and organisation_members.user_id = auth.uid()
        and organisation_members.role in ('owner', 'admin', 'manager')
    )
  )
  with check (
    exists (
      select 1 from organisation_members
      where organisation_members.org_id = scheduled_calls.org_id
        and organisation_members.user_id = auth.uid()
        and organisation_members.role in ('owner', 'admin', 'manager')
    )
  );

-- Allow all org members to insert instant calls (any member can start)
create policy "org members can start instant calls"
  on scheduled_calls for insert
  with check (
    exists (
      select 1 from organisation_members
      where organisation_members.org_id = scheduled_calls.org_id
        and organisation_members.user_id = auth.uid()
    )
  );

create table if not exists call_invitees (
  id            uuid primary key default gen_random_uuid(),
  call_id       uuid references scheduled_calls on delete cascade not null,
  user_id       uuid references auth.users on delete cascade,
  email         text not null,
  display_name  text,
  status        text not null default 'pending',
  guest_token   uuid not null default gen_random_uuid()
);

alter table call_invitees enable row level security;

-- Users can read/update their own invitee rows
create policy "users manage own invitee rows"
  on call_invitees for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Call creator can read all invitees for their calls
create policy "call creator can read invitees"
  on call_invitees for select
  using (
    exists (
      select 1 from scheduled_calls
      where scheduled_calls.id = call_invitees.call_id
        and scheduled_calls.created_by = auth.uid()
    )
  );

-- Managers can insert invitees (when scheduling a call)
create policy "managers can insert invitees"
  on call_invitees for insert
  with check (
    exists (
      select 1 from scheduled_calls
      join organisation_members
        on organisation_members.org_id = scheduled_calls.org_id
      where scheduled_calls.id = call_invitees.call_id
        and organisation_members.user_id = auth.uid()
        and organisation_members.role in ('owner', 'admin', 'manager')
    )
  );

-- pg_cron: send call reminders every 5 minutes
select cron.schedule(
  'video-call-reminders',
  '*/5 * * * *',
  $$
  select net.http_get(
    url     := 'https://timewisehub.vercel.app/api/video/send-reminders',
    headers := '{"Content-Type":"application/json","x-cron-secret":"484975b6-1f16-484a-a991-5f51b963a32f"}'::jsonb
  )
  $$
);
