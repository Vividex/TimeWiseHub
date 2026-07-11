-- ============================================================
-- TimeWiseHub — Schema 098: Vehicle tracking
-- Tracks company vehicles (rego, year/make/model, servicing schedule,
-- odometer history, employee assignment). Vehicle-related costs are just
-- normal `is_business` expense rows tagged with `vehicle_id` — that's the
-- entire "feeds business expenses" mechanism, no separate ledger.
--
-- Visibility (via can_access_vehicle()):
--   - owner/admin: always, org-wide.
--   - manager: unassigned vehicles, vehicles assigned to someone in no
--     crew, or vehicles assigned to someone in a crew THIS manager runs
--     (crews.manager_id) — new crew-scoped pattern, not used elsewhere yet.
--   - anyone: if they are the vehicle's own assignee (view + log km/
--     expenses only — editing is separately gated to manager+ by role).
-- Run via Supabase MCP apply_migration (name: vehicle_tracking)
-- ============================================================

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  registration_number text not null,
  year smallint,
  make text,
  model text,
  assigned_user_id uuid references auth.users(id) on delete set null,
  current_odometer_km integer,
  next_service_due_date date,
  next_service_due_km integer,
  rego_expiry_date date,
  notes text,
  is_archived boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index vehicles_org_id_idx on public.vehicles(org_id);
create index vehicles_assigned_user_id_idx on public.vehicles(assigned_user_id);
create index vehicles_registration_number_idx on public.vehicles(registration_number);

create table public.vehicle_odometer_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  odometer_km integer not null,
  logged_at date not null default current_date,
  logged_by uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now()
);

create index vehicle_odometer_logs_vehicle_id_idx on public.vehicle_odometer_logs(vehicle_id);

alter table public.expenses add column vehicle_id uuid references public.vehicles(id) on delete set null;
create index expenses_vehicle_id_idx on public.expenses(vehicle_id);

alter table public.vehicles enable row level security;
alter table public.vehicle_odometer_logs enable row level security;

create or replace function public.can_access_vehicle(p_org_id uuid, p_assigned_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1 from organisation_members om
      where om.org_id = p_org_id and om.user_id = auth.uid()
      and (
        om.role in ('owner', 'admin')
        or (
          om.role = 'manager'
          and (
            p_assigned_user_id is null
            or not exists (select 1 from crew_members cm where cm.user_id = p_assigned_user_id)
            or exists (
              select 1 from crew_members cm
              join crews c on c.id = cm.crew_id
              where cm.user_id = p_assigned_user_id and c.manager_id = auth.uid()
            )
          )
        )
      )
    )
    or p_assigned_user_id = auth.uid();
$$;

create policy "Users can view accessible vehicles"
  on public.vehicles for select
  using (can_access_vehicle(org_id, assigned_user_id));

create policy "Managers+ can create vehicles"
  on public.vehicles for insert
  with check (
    exists (
      select 1 from organisation_members om
      where om.org_id = vehicles.org_id and om.user_id = auth.uid()
      and om.role in ('owner', 'admin', 'manager')
    )
    and can_access_vehicle(org_id, assigned_user_id)
  );

create policy "Managers+ can update accessible vehicles"
  on public.vehicles for update
  using (
    exists (
      select 1 from organisation_members om
      where om.org_id = vehicles.org_id and om.user_id = auth.uid()
      and om.role in ('owner', 'admin', 'manager')
    )
    and can_access_vehicle(org_id, assigned_user_id)
  )
  with check (
    exists (
      select 1 from organisation_members om
      where om.org_id = vehicles.org_id and om.user_id = auth.uid()
      and om.role in ('owner', 'admin', 'manager')
    )
    and can_access_vehicle(org_id, assigned_user_id)
  );

create policy "Admins can delete vehicles"
  on public.vehicles for delete
  using (
    exists (
      select 1 from organisation_members om
      where om.org_id = vehicles.org_id and om.user_id = auth.uid()
      and om.role in ('owner', 'admin')
    )
  );

create policy "Users can view odometer logs for accessible vehicles"
  on public.vehicle_odometer_logs for select
  using (
    exists (
      select 1 from vehicles v
      where v.id = vehicle_odometer_logs.vehicle_id
      and can_access_vehicle(v.org_id, v.assigned_user_id)
    )
  );

create policy "Users can log odometer readings for accessible vehicles"
  on public.vehicle_odometer_logs for insert
  with check (
    logged_by = auth.uid()
    and exists (
      select 1 from vehicles v
      where v.id = vehicle_odometer_logs.vehicle_id
      and can_access_vehicle(v.org_id, v.assigned_user_id)
    )
  );

-- Assigned employees (any role) can log/view business expenses tagged to
-- their own vehicle, in addition to the existing manager-creates/
-- admin-approves business-expense policies (schema-096) — Postgres ORs
-- multiple permissive policies together for the same command, so this is
-- additive, not a change to the existing rule.
create policy "Assigned employee can log expenses for their vehicle"
  on public.expenses for insert
  with check (
    is_business
    and user_id = auth.uid()
    and vehicle_id is not null
    and exists (select 1 from vehicles v where v.id = expenses.vehicle_id and v.assigned_user_id = auth.uid())
  );

create policy "Assigned employee can view expenses for their vehicle"
  on public.expenses for select
  using (
    vehicle_id is not null
    and exists (select 1 from vehicles v where v.id = expenses.vehicle_id and v.assigned_user_id = auth.uid())
  );

-- Inserting an odometer log also updates the vehicle's denormalized
-- current_odometer_km. A SECURITY DEFINER RPC (not a raw table UPDATE) is
-- required because the assigned employee is deliberately NOT granted
-- vehicles UPDATE by the policies above — their only sanctioned write to
-- the vehicle record is via this narrow, purpose-built function.
create or replace function public.log_vehicle_odometer(
  p_vehicle_id uuid,
  p_odometer_km integer,
  p_notes text default null
)
returns public.vehicle_odometer_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_assigned_user_id uuid;
  v_log public.vehicle_odometer_logs;
begin
  select org_id, assigned_user_id into v_org_id, v_assigned_user_id
  from vehicles where id = p_vehicle_id;

  if v_org_id is null then
    raise exception 'Vehicle not found';
  end if;

  if not can_access_vehicle(v_org_id, v_assigned_user_id) then
    raise exception 'Not authorised to log an odometer reading for this vehicle';
  end if;

  insert into vehicle_odometer_logs (vehicle_id, odometer_km, logged_by, notes)
  values (p_vehicle_id, p_odometer_km, auth.uid(), p_notes)
  returning * into v_log;

  update vehicles set current_odometer_km = p_odometer_km where id = p_vehicle_id;

  return v_log;
end;
$$;
