-- ============================================================
-- TimeWiseHub — Schema 006: Storage bucket for receipts
-- Run in Supabase SQL Editor
-- ============================================================

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false);

-- Users can upload their own receipts
create policy "Users can upload receipts"
  on storage.objects for insert
  with check (
    bucket_id = 'receipts' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can view their own receipts
create policy "Users can view their own receipts"
  on storage.objects for select
  using (
    bucket_id = 'receipts' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Managers can view receipts of org members
create policy "Managers can view org receipts"
  on storage.objects for select
  using (
    bucket_id = 'receipts' and
    exists (
      select 1 from public.organisation_members viewer
      join public.profiles target_profile on target_profile.id::text = (storage.foldername(name))[1]
      join public.organisation_members target on target.user_id = target_profile.id
      where viewer.org_id = target.org_id
        and viewer.user_id = auth.uid()
        and viewer.role in ('owner', 'admin', 'manager')
    )
  );

-- Users can delete their own receipts
create policy "Users can delete their own receipts"
  on storage.objects for delete
  using (
    bucket_id = 'receipts' and
    auth.uid()::text = (storage.foldername(name))[1]
  );
