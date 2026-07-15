-- ============================================================
-- TimeWiseHub — Schema 104: Client Sites
-- Multi-site support for the Trades & Field Services deep-dive. Lets a
-- client have more than one physical address (a landlord, strata manager,
-- or multi-branch commercial account). Gated in the UI by the
-- `supportsMultiSite` workspace-profile flag, not by RLS — rows can exist
-- for any org, same as `students` existing for every profile even though
-- only tutoring's UI currently surfaces them. Run via Supabase MCP
-- apply_migration (name: client_sites)
-- ============================================================

create table public.client_sites (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients on delete cascade,
  label         text not null,
  address       text not null,
  contact_name  text,
  contact_phone text,
  access_notes  text,
  is_archived   boolean not null default false,
  created_by    uuid references auth.users on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.client_sites enable row level security;

create policy "Owners can manage sites of their own clients"
  on public.client_sites for all
  using (
    exists (
      select 1 from public.clients c
      where c.id = client_sites.client_id and c.owner_id = auth.uid()
    )
  );

create policy "Org members can view sites of org clients"
  on public.client_sites for select
  using (
    exists (
      select 1 from public.clients c
      join public.organisation_members om on om.org_id = c.org_id
      where c.id = client_sites.client_id and om.user_id = auth.uid()
    )
  );

create policy "Org admins can manage sites of org clients"
  on public.client_sites for all
  using (
    exists (
      select 1 from public.clients c
      join public.organisation_members om on om.org_id = c.org_id
      where c.id = client_sites.client_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

create index client_sites_client on public.client_sites (client_id);

alter table public.sessions
  add column site_id uuid references public.client_sites on delete set null;

alter table public.incident_reports
  add column client_id uuid references public.clients on delete set null,
  add column site_id uuid references public.client_sites on delete set null;
