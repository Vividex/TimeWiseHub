-- ============================================================
-- TimeWiseHub — Schema 044: Username, Nickname & Avatar
-- ============================================================

-- Add columns (nullable so existing rows are unaffected)
alter table public.profiles
  add column if not exists username      text,
  add column if not exists nickname      text,
  add column if not exists avatar_config jsonb;

-- Unique constraint on username (nulls are not considered equal, so multiple
-- null rows are allowed — users without a username won't conflict)
create unique index if not exists profiles_username_unique
  on public.profiles (username)
  where username is not null;

-- Public avatars bucket (profile photos visible to all org members)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Only the owner may upload/replace their avatar (path starts with their user id)
create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Backfill demo accounts
update public.profiles
  set username = 'sam_rivers', nickname = 'Sam Rivers'
  where email = 'demo.manager@vividex.au';

update public.profiles
  set username = 'jordan_avery', nickname = 'Jordan Avery'
  where email = 'demo.employee@vividex.au';

-- Update the new-user trigger to capture username from sign-up metadata
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, username)
  values (
    new.id,
    new.email,
    nullif(trim(new.raw_user_meta_data->>'username'), '')
  );
  return new;
end;
$$;
