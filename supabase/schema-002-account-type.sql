-- ============================================================
-- TimeWiseHub — Schema 002: Account type + invitations
-- Run in Supabase SQL Editor
-- ============================================================


-- ── Account type on profiles ─────────────────────────────────

create type public.account_type as enum ('personal', 'org_owner');

alter table public.profiles
  add column account_type public.account_type not null default 'personal';

-- Update trigger to capture account_type from signup metadata
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, account_type)
  values (
    new.id,
    new.email,
    coalesce(
      (new.raw_user_meta_data->>'account_type')::public.account_type,
      'personal'
    )
  );
  return new;
end;
$$;


-- ── Invitations ──────────────────────────────────────────────

create table public.invitations (
  id          uuid default gen_random_uuid() primary key,
  org_id      uuid not null references public.organisations on delete cascade,
  email       text not null,
  role        public.member_role not null default 'employee',
  token       uuid not null default gen_random_uuid() unique,
  invited_by  uuid not null references public.profiles on delete cascade,
  accepted_at timestamptz,
  expires_at  timestamptz not null default now() + interval '7 days',
  created_at  timestamptz not null default now(),
  unique(org_id, email)
);

alter table public.invitations enable row level security;

-- Org owners and admins can view invitations for their org
create policy "Owners and admins can view invitations"
  on public.invitations for select
  using (
    exists (
      select 1 from public.organisation_members om
      where om.org_id = invitations.org_id
      and om.user_id = auth.uid()
      and om.role in ('owner', 'admin')
    )
  );

-- Org owners and admins can create invitations
create policy "Owners and admins can create invitations"
  on public.invitations for insert
  with check (
    exists (
      select 1 from public.organisation_members om
      where om.org_id = invitations.org_id
      and om.user_id = auth.uid()
      and om.role in ('owner', 'admin')
    )
  );

-- Allow anyone to read an invitation by token (for accept flow)
create policy "Anyone can read invitation by token"
  on public.invitations for select
  using (true);

-- Allow authenticated users to accept their own invitation
create policy "Users can accept their invitation"
  on public.invitations for update
  using (email = (select email from public.profiles where id = auth.uid()));
