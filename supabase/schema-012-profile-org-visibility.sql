-- ============================================================
-- TimeWiseHub — Schema 012: Org member profile visibility
-- Run in Supabase SQL Editor
-- ============================================================

-- Allow org members to view profiles of other members in their org
-- (needed for manager dashboard to display employee names)
create policy "Org members can view member profiles"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.organisation_members om1
      join public.organisation_members om2 on om1.org_id = om2.org_id
      where om1.user_id = auth.uid()
        and om2.user_id = profiles.id
    )
  );
