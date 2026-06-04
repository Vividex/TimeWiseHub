-- ============================================================
-- TimeWiseHub — Schema 017: Leave management
-- Run in Supabase SQL Editor
-- ============================================================

create type public.leave_type   as enum ('annual', 'sick', 'personal', 'public_holiday', 'unpaid', 'other');
create type public.leave_status as enum ('draft', 'submitted', 'approved', 'rejected');


-- ── Leave requests ────────────────────────────────────────────

create table public.leave_requests (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid not null references public.profiles on delete cascade,
  org_id       uuid references public.organisations on delete cascade,
  leave_type   public.leave_type   not null,
  start_date   date not null,
  end_date     date not null,
  half_day     boolean not null default false,
  notes        text,
  status       public.leave_status not null default 'submitted',
  reviewed_by  uuid references public.profiles,
  reviewed_at  timestamptz,
  review_note  text,
  created_at   timestamptz not null default now(),
  check (end_date >= start_date)
);

alter table public.leave_requests enable row level security;

create policy "Users can manage their own leave requests"
  on public.leave_requests for all
  using (auth.uid() = user_id);

create policy "Managers can view org leave requests"
  on public.leave_requests for select
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = leave_requests.org_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

create policy "Managers can update org leave requests"
  on public.leave_requests for update
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = leave_requests.org_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

create index leave_requests_user on public.leave_requests (user_id, start_date desc);
create index leave_requests_org  on public.leave_requests (org_id, status);


-- ── Leave balances (entitlements per user per year) ───────────

create table public.leave_balances (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid not null references public.profiles on delete cascade,
  org_id        uuid references public.organisations on delete cascade,
  leave_type    public.leave_type not null,
  year          integer not null,
  entitled_days numeric(4,1) not null default 0,
  created_at    timestamptz not null default now(),
  unique(user_id, leave_type, year)
);

alter table public.leave_balances enable row level security;

create policy "Users can manage their own leave balances"
  on public.leave_balances for all
  using (auth.uid() = user_id);

create policy "Managers can manage org leave balances"
  on public.leave_balances for all
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = leave_balances.org_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );


-- ── Activity trigger ──────────────────────────────────────────

create or replace function public.record_leave_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_log (user_id, event_type, entity_type, entity_id, metadata)
  values (
    auth.uid(), TG_OP, 'leave_requests', coalesce(NEW.id, OLD.id),
    jsonb_build_object(
      'leave_type', coalesce(NEW.leave_type::text, OLD.leave_type::text),
      'status',     coalesce(NEW.status::text,     OLD.status::text),
      'start_date', coalesce(NEW.start_date::text, OLD.start_date::text),
      'end_date',   coalesce(NEW.end_date::text,   OLD.end_date::text)
    )
  );
  return coalesce(NEW, OLD);
end;
$$;

create trigger trg_activity_leave_requests
  after insert or update or delete on public.leave_requests
  for each row execute function public.record_leave_activity();
