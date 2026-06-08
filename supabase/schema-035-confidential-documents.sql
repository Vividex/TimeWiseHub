-- ============================================================
-- TimeWiseHub — Schema 035: Confidential project documents
-- Phase 5.5b — role-gated (management-only) document confidentiality.
-- Run via Supabase MCP apply_migration (name: confidential_documents)
-- ============================================================

-- ── 1. Column ────────────────────────────────────────────────
alter table public.project_documents
  add column if not exists confidential boolean not null default false;

-- ── 2. Metadata RLS ──────────────────────────────────────────
-- Replace the single open ALL policy from schema-008.
drop policy if exists "Project members can manage documents" on public.project_documents;

-- SELECT: project visibility AND (not confidential OR uploader OR management)
create policy "View documents (confidential gated)"
  on public.project_documents for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_documents.project_id
      and (
        p.owner_id = auth.uid()
        or exists (select 1 from public.project_members pm
                   where pm.project_id = project_documents.project_id
                     and pm.user_id = auth.uid())
        or exists (select 1 from public.organisation_members om
                   where om.org_id = p.org_id and om.user_id = auth.uid())
      )
    )
    and (
      confidential = false
      or uploaded_by = auth.uid()
      or exists (
        select 1 from public.projects p
        join public.organisation_members om on om.org_id = p.org_id
        where p.id = project_documents.project_id
          and om.user_id = auth.uid()
          and om.role in ('owner', 'admin', 'manager')
      )
    )
  );

-- INSERT: any project owner/member or org member may add (and may set
-- confidential = true on their own upload at insert time).
create policy "Add documents"
  on public.project_documents for insert
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_documents.project_id
      and (
        p.owner_id = auth.uid()
        or exists (select 1 from public.project_members pm
                   where pm.project_id = project_documents.project_id
                     and pm.user_id = auth.uid())
        or exists (select 1 from public.organisation_members om
                   where om.org_id = p.org_id and om.user_id = auth.uid())
      )
    )
  );

-- UPDATE: uploader OR management
create policy "Modify documents (uploader or management)"
  on public.project_documents for update
  using (
    uploaded_by = auth.uid()
    or exists (
      select 1 from public.projects p
      join public.organisation_members om on om.org_id = p.org_id
      where p.id = project_documents.project_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  )
  with check (
    uploaded_by = auth.uid()
    or exists (
      select 1 from public.projects p
      join public.organisation_members om on om.org_id = p.org_id
      where p.id = project_documents.project_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

-- DELETE: uploader OR management
create policy "Remove documents (uploader or management)"
  on public.project_documents for delete
  using (
    uploaded_by = auth.uid()
    or exists (
      select 1 from public.projects p
      join public.organisation_members om on om.org_id = p.org_id
      where p.id = project_documents.project_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

-- ── 3. Flag-change trigger ───────────────────────────────────
-- RLS cannot compare old vs new; enforce "only management changes the
-- confidential flag" here. INSERT is untouched, so an uploader may still
-- set confidential = true when first creating the row.
create or replace function public.enforce_confidential_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.confidential is distinct from old.confidential then
    if not exists (
      select 1 from public.projects p
      join public.organisation_members om on om.org_id = p.org_id
      where p.id = new.project_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    ) then
      raise exception 'Only managers can change document confidentiality';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists project_documents_confidential_guard on public.project_documents;
create trigger project_documents_confidential_guard
  before update of confidential on public.project_documents
  for each row execute function public.enforce_confidential_change();

revoke execute on function public.enforce_confidential_change() from public, anon, authenticated;

-- ── 4. Storage RLS ───────────────────────────────────────────
-- Gate the actual file objects the same way (join on exact storage path).
-- INSERT (own folder) and DELETE (own folder) policies are left unchanged.
drop policy if exists "Org members can view project documents" on storage.objects;

create policy "View project document objects (confidential gated)"
  on storage.objects for select
  using (
    bucket_id = 'project-documents'
    and exists (
      select 1
      from public.project_documents d
      join public.projects p on p.id = d.project_id
      where d.storage_path = storage.objects.name
        and (
          p.owner_id = auth.uid()
          or exists (select 1 from public.project_members pm
                     where pm.project_id = d.project_id and pm.user_id = auth.uid())
          or exists (select 1 from public.organisation_members om
                     where om.org_id = p.org_id and om.user_id = auth.uid())
        )
        and (
          d.confidential = false
          or d.uploaded_by = auth.uid()
          or exists (select 1 from public.organisation_members om
                     where om.org_id = p.org_id
                       and om.user_id = auth.uid()
                       and om.role in ('owner', 'admin', 'manager'))
        )
    )
  );
