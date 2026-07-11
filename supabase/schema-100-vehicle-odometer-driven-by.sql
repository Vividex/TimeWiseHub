-- ============================================================
-- TimeWiseHub — Schema 100: Optional driver attribution on odometer logs
-- Some vehicles are shared by more than one person. Rather than a
-- reservation/booking system (real fleet products keep that as a
-- separate module for much larger fleets than this business has),
-- this is a single optional field: who was actually driving the day
-- an odometer reading was logged, separate from the vehicle's current
-- assigned owner. Deliberately NOT added to `expenses` — that table's
-- user_id already means "who submitted this," which can legitimately
-- differ from who was driving; overloading it would pollute a shared
-- table's semantics for every other expense type app-wide.
-- Run via Supabase MCP apply_migration (name: vehicle_odometer_driven_by)
-- ============================================================

alter table public.vehicle_odometer_logs add column driven_by uuid references auth.users(id);

-- Backward-compatible: appends a new defaulted parameter, existing callers that omit
-- it keep working unmodified.
create or replace function public.log_vehicle_odometer(
  p_vehicle_id uuid,
  p_odometer_km integer,
  p_notes text default null,
  p_driven_by uuid default null
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

  insert into vehicle_odometer_logs (vehicle_id, odometer_km, logged_by, notes, driven_by)
  values (p_vehicle_id, p_odometer_km, auth.uid(), p_notes, p_driven_by)
  returning * into v_log;

  update vehicles set current_odometer_km = p_odometer_km where id = p_vehicle_id;

  return v_log;
end;
$$;
