-- Phase 5.5a: allow any org member to create clients and projects for their org

-- Allow any org member to create clients for their org
create policy "Org members can insert org clients"
  on public.clients for insert
  with check (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = clients.org_id and om.user_id = auth.uid()
    )
  );

-- Allow any org member to create projects for their org
create policy "Org members can insert org projects"
  on public.projects for insert
  with check (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = projects.org_id and om.user_id = auth.uid()
    )
  );
