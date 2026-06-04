-- ============================================================
-- TimeWiseHub — Schema 018: Clients, billable time, project budgets
-- Run in Supabase SQL Editor
-- ============================================================


-- ── Clients ──────────────────────────────────────────────────

create table public.clients (
  id           uuid default gen_random_uuid() primary key,
  owner_id     uuid not null references public.profiles on delete cascade,
  org_id       uuid references public.organisations on delete cascade,
  name         text not null,
  email        text,
  phone        text,
  address      text,
  default_rate numeric(10,2),
  currency     text not null default 'AUD',
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);

alter table public.clients enable row level security;

create policy "Owners can manage their own clients"
  on public.clients for all
  using (auth.uid() = owner_id);

create policy "Org members can view org clients"
  on public.clients for select
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = clients.org_id and om.user_id = auth.uid()
    )
  );

create policy "Org admins can manage org clients"
  on public.clients for all
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = clients.org_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

create index clients_owner on public.clients (owner_id);
create index clients_org   on public.clients (org_id);


-- ── Link projects to clients + add budgets ────────────────────

alter table public.projects
  add column client_id    uuid references public.clients(id) on delete set null,
  add column budget_hours numeric(8,2),
  add column budget_dollars numeric(10,2);


-- ── Billable flag + rate on time entries ──────────────────────

alter table public.time_entries
  add column billable      boolean not null default true,
  add column billable_rate numeric(10,2);


-- ── Activity trigger for clients ─────────────────────────────

create or replace function public.record_client_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_log (user_id, event_type, entity_type, entity_id, metadata)
  values (
    auth.uid(), TG_OP, 'clients', coalesce(NEW.id, OLD.id),
    jsonb_build_object('name', coalesce(NEW.name, OLD.name))
  );
  return coalesce(NEW, OLD);
end;
$$;

create trigger trg_activity_clients
  after insert or update or delete on public.clients
  for each row execute function public.record_client_activity();
