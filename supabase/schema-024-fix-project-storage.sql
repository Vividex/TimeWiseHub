-- ============================================================
-- TimeWiseHub — Schema 024: Fix project document storage policies
-- Run in Supabase SQL Editor
--
-- Replaces the overly permissive schema-009 policies that allowed
-- any authenticated user to read/write all project documents.
-- ============================================================

-- Drop the broken policies from schema-009
drop policy if exists "Authenticated users can upload project documents" on storage.objects;
drop policy if exists "Authenticated users can view project documents" on storage.objects;

-- INSERT: users may only upload into their own subfolder ({user_id}/filename)
create policy "Users can upload to their own project document folder"
  on storage.objects for insert
  with check (
    bucket_id = 'project-documents' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- SELECT: owner of the folder OR any member of the same org as the uploader
create policy "Org members can view project documents"
  on storage.objects for select
  using (
    bucket_id = 'project-documents' and
    (
      -- uploader can always read their own files
      auth.uid()::text = (storage.foldername(name))[1]
      or
      -- org members can read files uploaded by other members of the same org
      exists (
        select 1
        from public.organisation_members viewer
        join public.organisation_members uploader
          on uploader.org_id = viewer.org_id
        where viewer.user_id = auth.uid()
          and uploader.user_id::text = (storage.foldername(name))[1]
      )
    )
  );
