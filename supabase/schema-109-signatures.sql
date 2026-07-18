-- ============================================================
-- TimeWiseHub — Schema 109: Reusable per-user signatures
-- Adds profiles.signature_path plus a private storage bucket so a user
-- draws their signature once (Settings) and it's reused across every
-- SWMS/JSA acknowledgment. RLS is owner-only (read/write your own file
-- only) -- the on-demand PDF route (Task 13) reads other users'
-- signatures via the service-role client, not via RLS, to avoid a
-- cross-referencing policy like the one that caused today's
-- project_members recursion bug. Run via Supabase MCP apply_migration
-- (name: jsa_signatures)
-- ============================================================

alter table public.profiles
  add column signature_path text;

insert into storage.buckets (id, name, public)
  values ('signatures', 'signatures', false)
  on conflict (id) do nothing;

create policy "Users can view their own signature"
  on storage.objects for select
  using (
    bucket_id = 'signatures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can upload their own signature"
  on storage.objects for insert
  with check (
    bucket_id = 'signatures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can replace their own signature"
  on storage.objects for update
  using (
    bucket_id = 'signatures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
