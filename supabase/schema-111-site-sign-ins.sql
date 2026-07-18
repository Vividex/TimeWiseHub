-- ============================================================
-- TimeWiseHub — Schema 111: Site sign-in
-- Lets a project optionally point at a client_sites row (client_sites is
-- client-scoped today with no project link at all), and adds a daily,
-- idempotent per-site sign-in that supplements (doesn't replace)
-- project_members as an access grant to that project's SWMS/JSA documents.
-- "Today" here means the Australia/Sydney calendar day, matching the rest
-- of this app's date handling (src/lib/today.ts) -- NOT Postgres's bare
-- current_date, which is off by roughly half a day against Sydney time.
-- Run via Supabase MCP apply_migration (name: site_sign_ins)
-- ============================================================

alter table public.projects
  add column site_id uuid references public.client_sites(id);

create table public.site_sign_ins (
  id             uuid primary key default gen_random_uuid(),
  site_id        uuid not null references public.client_sites(id),
  user_id        uuid not null references auth.users,
  sign_in_date   date not null default ((now() at time zone 'Australia/Sydney')::date),
  signed_in_at   timestamptz not null default now(),
  unique (site_id, user_id, sign_in_date)
);

alter table public.site_sign_ins enable row level security;

create policy "Users can sign themselves in"
  on public.site_sign_ins for insert
  with check (user_id = auth.uid());

create policy "Users can view their own sign-ins"
  on public.site_sign_ins for select
  using (user_id = auth.uid());

create policy "Org managers can view sign-ins for their org's sites"
  on public.site_sign_ins for select
  using (
    exists (
      select 1 from public.client_sites cs
      join public.clients c on c.id = cs.client_id
      join public.organisation_members om on om.org_id = c.org_id
      where cs.id = site_sign_ins.site_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

create index site_sign_ins_site_date on public.site_sign_ins (site_id, sign_in_date);
create index site_sign_ins_user_recent on public.site_sign_ins (user_id, signed_in_at desc);

-- Supplement project_swms_documents SELECT with "signed into this project's site today"
drop policy "Crew and managers can view SWMS documents" on public.project_swms_documents;

create policy "Crew and managers can view SWMS documents"
  on public.project_swms_documents for select
  using (
    exists (
      select 1 from public.project_members pm
      where pm.project_id = project_swms_documents.project_id and pm.user_id = auth.uid()
    )
    or exists (
      select 1 from public.projects p
      where p.id = project_swms_documents.project_id and p.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.projects p
      join public.organisation_members om on om.org_id = p.org_id
      where p.id = project_swms_documents.project_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
    or exists (
      select 1 from public.projects p
      join public.site_sign_ins ssi on ssi.site_id = p.site_id
      where p.id = project_swms_documents.project_id
        and ssi.user_id = auth.uid()
        and ssi.sign_in_date = ((now() at time zone 'Australia/Sydney')::date)
    )
  );

-- Supplement project_swms_acknowledgments INSERT with the same condition
drop policy "Crew members can acknowledge for themselves" on public.project_swms_acknowledgments;

create policy "Crew members can acknowledge for themselves"
  on public.project_swms_acknowledgments for insert
  with check (
    user_id = auth.uid()
    and (
      exists (
        select 1 from public.project_swms_documents d
        join public.project_members pm on pm.project_id = d.project_id
        where d.id = project_swms_acknowledgments.swms_document_id and pm.user_id = auth.uid()
      )
      or exists (
        select 1 from public.project_swms_documents d
        join public.projects p on p.id = d.project_id
        join public.site_sign_ins ssi on ssi.site_id = p.site_id
        where d.id = project_swms_acknowledgments.swms_document_id
          and ssi.user_id = auth.uid()
          and ssi.sign_in_date = ((now() at time zone 'Australia/Sydney')::date)
      )
    )
  );

-- Supplement the project-swms storage SELECT policy with the same condition
drop policy "Crew and managers can view SWMS objects" on storage.objects;

create policy "Crew and managers can view SWMS objects"
  on storage.objects for select
  using (
    bucket_id = 'project-swms'
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(objects.name))[1]
        and (
          p.owner_id = auth.uid()
          or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = auth.uid())
          or exists (
            select 1 from public.organisation_members om
            where om.org_id = p.org_id and om.user_id = auth.uid()
              and om.role in ('owner', 'admin', 'manager')
          )
          or exists (
            select 1 from public.site_sign_ins ssi
            where ssi.site_id = p.site_id
              and ssi.user_id = auth.uid()
              and ssi.sign_in_date = ((now() at time zone 'Australia/Sydney')::date)
          )
        )
    )
  );
