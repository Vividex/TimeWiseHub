-- ============================================================
-- TimeWiseHub — Schema 099: Vehicle notes log, rego-lookup state column
-- Adds an append-only notes log for vehicles (mirrors
-- vehicle_odometer_logs exactly — same can_access_vehicle() RLS gate,
-- no update/delete policy). Adds vehicles.state (AU state/territory,
-- needed for the rego-lookup API) and drops the old single-text
-- vehicles.notes column — no real vehicle data exists in production
-- yet, so this is a clean removal, not a migration.
-- Run via Supabase MCP apply_migration (name: vehicle_notes_and_rego_lookup)
-- ============================================================

create table public.vehicle_notes (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  note text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index vehicle_notes_vehicle_id_idx on public.vehicle_notes(vehicle_id);

alter table public.vehicle_notes enable row level security;

create policy "Users can view notes for accessible vehicles"
  on public.vehicle_notes for select
  using (
    exists (
      select 1 from vehicles v
      where v.id = vehicle_notes.vehicle_id
      and can_access_vehicle(v.org_id, v.assigned_user_id)
    )
  );

create policy "Users can add notes for accessible vehicles"
  on public.vehicle_notes for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from vehicles v
      where v.id = vehicle_notes.vehicle_id
      and can_access_vehicle(v.org_id, v.assigned_user_id)
    )
  );

alter table public.vehicles add column state text;
alter table public.vehicles drop column notes;
