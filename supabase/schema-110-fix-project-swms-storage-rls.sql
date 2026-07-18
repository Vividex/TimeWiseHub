-- ============================================================
-- TimeWiseHub — Schema 110: Fix project-swms storage RLS
-- schema-105's three "project-swms" bucket policies (view/upload/delete) each wrote
-- storage.foldername(p.name), intending "the object's own path" -- but inside a correlated
-- subquery `from public.projects p`, the unqualified `name` resolves to p.name (the
-- project's plain-text name, e.g. "shed conversion") instead of storage.objects.name (the
-- actual upload path, e.g. "<project-uuid>/169...-jsa-ladder_step.pdf"). Comparing a
-- project's UUID against foldername-of-its-own-plain-text-name can essentially never match,
-- so every authored SWMS/JSA document upload has been silently blocked by RLS since
-- schema-105 was first applied -- surfaced live when generating a JSA. Fixes all three
-- policies to reference objects.name explicitly. Run via Supabase MCP apply_migration
-- (name: fix_project_swms_storage_rls)
-- ============================================================

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
        )
    )
  );

drop policy "Managers can upload SWMS documents" on storage.objects;

create policy "Managers can upload SWMS documents"
  on storage.objects for insert
  with check (
    bucket_id = 'project-swms'
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(objects.name))[1]
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

drop policy "Managers can delete SWMS objects" on storage.objects;

create policy "Managers can delete SWMS objects"
  on storage.objects for delete
  using (
    bucket_id = 'project-swms'
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(objects.name))[1]
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
