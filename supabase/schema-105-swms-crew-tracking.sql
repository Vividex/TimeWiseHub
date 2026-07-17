-- ============================================================
-- TimeWiseHub — Schema 105: SWMS + Crew Tracking
-- Wires up the existing-but-unused project_members table (project_documents'
-- RLS already references it) and adds SWMS (Safe Work Method Statement)
-- document tracking with per-crew-member acknowledgment. Gated in the UI by
-- the `supportsSwms` workspace-profile flag (trades_field_services,
-- builder_construction). Also adds storage RLS for the existing-but-empty
-- employee-docs bucket (certifications document upload). Run via Supabase
-- MCP apply_migration (name: swms_crew_tracking)
-- ============================================================

alter table public.project_members enable row level security;

create policy "Crew members can view their project's crew"
  on public.project_members for select
  using (
    exists (
      select 1 from public.project_members pm2
      where pm2.project_id = project_members.project_id and pm2.user_id = auth.uid()
    )
  );

create policy "Project owners can manage their own project's crew"
  on public.project_members for all
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_members.project_id and p.owner_id = auth.uid()
    )
  );

create policy "Org admins/managers can manage project crew"
  on public.project_members for all
  using (
    exists (
      select 1 from public.projects p
      join public.organisation_members om on om.org_id = p.org_id
      where p.id = project_members.project_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

create table public.project_swms_documents (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects on delete cascade,
  name          text not null,
  storage_path  text not null,
  uploaded_by   uuid not null references auth.users,
  created_at    timestamptz not null default now()
);

alter table public.project_swms_documents enable row level security;

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
  );

create policy "Managers can manage SWMS documents"
  on public.project_swms_documents for all
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_swms_documents.project_id and p.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.projects p
      join public.organisation_members om on om.org_id = p.org_id
      where p.id = project_swms_documents.project_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

create index project_swms_documents_project on public.project_swms_documents (project_id);

create table public.project_swms_acknowledgments (
  id                 uuid primary key default gen_random_uuid(),
  swms_document_id   uuid not null references public.project_swms_documents on delete cascade,
  user_id            uuid not null references auth.users,
  acknowledged_at    timestamptz not null default now(),
  unique (swms_document_id, user_id)
);

alter table public.project_swms_acknowledgments enable row level security;

create policy "Crew and managers can view acknowledgments"
  on public.project_swms_acknowledgments for select
  using (
    exists (
      select 1 from public.project_swms_documents d
      join public.project_members pm on pm.project_id = d.project_id
      where d.id = project_swms_acknowledgments.swms_document_id and pm.user_id = auth.uid()
    )
    or exists (
      select 1 from public.project_swms_documents d
      join public.projects p on p.id = d.project_id
      where d.id = project_swms_acknowledgments.swms_document_id and p.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.project_swms_documents d
      join public.projects p on p.id = d.project_id
      join public.organisation_members om on om.org_id = p.org_id
      where d.id = project_swms_acknowledgments.swms_document_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

create policy "Crew members can acknowledge for themselves"
  on public.project_swms_acknowledgments for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.project_swms_documents d
      join public.project_members pm on pm.project_id = d.project_id
      where d.id = project_swms_acknowledgments.swms_document_id and pm.user_id = auth.uid()
    )
  );

create index project_swms_acks_document on public.project_swms_acknowledgments (swms_document_id);

insert into storage.buckets (id, name, public)
  values ('project-swms', 'project-swms', false)
  on conflict (id) do nothing;

create policy "Managers can upload SWMS documents"
  on storage.objects for insert
  with check (
    bucket_id = 'project-swms'
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(name))[1]
        and (
          p.owner_id = auth.uid()
          or exists (
            select 1 from public.organisation_members om
            where om.org_id = p.org_id and om.user_id = auth.uid()
              and om.role in ('owner', 'admin', 'manager')
          )
        )
    )
  );

create policy "Crew and managers can view SWMS objects"
  on storage.objects for select
  using (
    bucket_id = 'project-swms'
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(name))[1]
        and (
          p.owner_id = auth.uid()
          or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = auth.uid())
          or exists (
            select 1 from public.organisation_members om
            where om.org_id = p.org_id and om.user_id = auth.uid()
              and om.role in ('owner', 'admin', 'manager')
          )
        )
    )
  );

create policy "Managers can delete SWMS objects"
  on storage.objects for delete
  using (
    bucket_id = 'project-swms'
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(name))[1]
        and (
          p.owner_id = auth.uid()
          or exists (
            select 1 from public.organisation_members om
            where om.org_id = p.org_id and om.user_id = auth.uid()
              and om.role in ('owner', 'admin', 'manager')
          )
        )
    )
  );

create policy "Org members can view employee documents"
  on storage.objects for select
  using (
    bucket_id = 'employee-docs'
    and exists (
      select 1 from public.certifications c
      join public.organisation_members om on om.org_id = c.org_id
      where c.document_path = objects.name and om.user_id = auth.uid()
    )
  );

create policy "Managers can upload employee documents"
  on storage.objects for insert
  with check (
    bucket_id = 'employee-docs'
    and exists (
      select 1 from public.organisation_members om
      where om.org_id::text = (storage.foldername(name))[1]
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

create policy "Managers can delete employee documents"
  on storage.objects for delete
  using (
    bucket_id = 'employee-docs'
    and exists (
      select 1 from public.certifications c
      join public.organisation_members om on om.org_id = c.org_id
      where c.document_path = objects.name and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );
