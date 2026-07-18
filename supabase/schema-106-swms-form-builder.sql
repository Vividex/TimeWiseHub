-- ============================================================
-- TimeWiseHub — Schema 106: SWMS Form Builder
-- Adds structured-authoring support to project_swms_documents (category,
-- content, source) and a licence_class field to certifications for the SWMS
-- licence cross-check. Also fixes a real pre-existing gap found during
-- research: the employee-docs upload storage policy only allowed
-- owner/admin, while certifications' own INSERT policy (schema-046) allows
-- owner/admin/manager — a manager could add a certification row but fail to
-- upload its document. Run via Supabase MCP apply_migration
-- (name: swms_form_builder)
-- ============================================================

alter table public.project_swms_documents
  add column category text,
  add column content jsonb,
  add column source text not null default 'uploaded';

alter table public.project_swms_documents
  add constraint project_swms_documents_source_check
  check (source in ('uploaded', 'authored'));

alter table public.certifications
  add column licence_class text;

drop policy "Managers can upload employee documents" on storage.objects;

create policy "Managers can upload employee documents"
  on storage.objects for insert
  with check (
    bucket_id = 'employee-docs'
    and exists (
      select 1 from public.organisation_members om
      where om.org_id::text = (storage.foldername(name))[1]
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

drop policy "Managers can delete employee documents" on storage.objects;

create policy "Managers can delete employee documents"
  on storage.objects for delete
  using (
    bucket_id = 'employee-docs'
    and exists (
      select 1 from public.certifications c
      join public.organisation_members om on om.org_id = c.org_id
      where c.document_path = objects.name and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );
