-- ============================================================
-- TimeWiseHub - Schema 021: Member rates and time rounding
-- Run in Supabase SQL Editor
-- ============================================================

alter table public.organisation_members
  add column hourly_rate numeric(10,2);

alter table public.organisations
  add column time_rounding_minutes integer not null default 0,
  add constraint organisations_time_rounding_minutes_check
    check (time_rounding_minutes in (0, 15));

create policy "Owners and admins can update organisation settings"
  on public.organisations for update
  using (
    exists (
      select 1 from public.organisation_members om
      where om.org_id = organisations.id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.organisation_members om
      where om.org_id = organisations.id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );
