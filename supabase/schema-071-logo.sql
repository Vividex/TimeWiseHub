-- Add logo_url to both profile and org tables
alter table public.profiles add column if not exists logo_url text;
alter table public.organisations add column if not exists logo_url text;

-- Public logos bucket (URLs must be stable for emails and PDFs)
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

-- Solo users: own path by userId (folder[1] = userId)
create policy "Users can upload their own logo"
  on storage.objects for insert
  with check (
    bucket_id = 'logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their own logo"
  on storage.objects for delete
  using (
    bucket_id = 'logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Org admins: own path by orgId (folder[1] = orgId)
create policy "Org admins can upload org logo"
  on storage.objects for insert
  with check (
    bucket_id = 'logos'
    and exists (
      select 1 from public.organisation_members om
      where om.user_id = auth.uid()
        and om.org_id::text = (storage.foldername(name))[1]
        and om.role in ('owner', 'admin')
    )
  );

create policy "Org admins can delete org logo"
  on storage.objects for delete
  using (
    bucket_id = 'logos'
    and exists (
      select 1 from public.organisation_members om
      where om.user_id = auth.uid()
        and om.org_id::text = (storage.foldername(name))[1]
        and om.role in ('owner', 'admin')
    )
  );

create policy "Logos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'logos');
