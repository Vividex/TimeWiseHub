-- ============================================================
-- TimeWiseHub — Schema 009: Storage bucket for project documents
-- Run in Supabase SQL Editor
-- ============================================================

insert into storage.buckets (id, name, public)
values ('project-documents', 'project-documents', false);

create policy "Authenticated users can upload project documents"
  on storage.objects for insert
  with check (
    bucket_id = 'project-documents' and
    auth.role() = 'authenticated'
  );

create policy "Authenticated users can view project documents"
  on storage.objects for select
  using (
    bucket_id = 'project-documents' and
    auth.role() = 'authenticated'
  );

create policy "Uploaders can delete their project documents"
  on storage.objects for delete
  using (
    bucket_id = 'project-documents' and
    auth.uid()::text = (storage.foldername(name))[1]
  );
