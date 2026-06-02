-- ============================================================
-- TimeWiseHub — Schema 001: Profiles, Organisations, Members
-- Run in Supabase SQL Editor
-- ============================================================


-- ── Profiles ────────────────────────────────────────────────
-- One row per auth user. Auto-created on sign-up via trigger.

create table public.profiles (
  id          uuid references auth.users on delete cascade primary key,
  email       text not null,
  full_name   text,
  avatar_url  text,
  timezone    text not null default 'UTC',
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);


-- ── Auto-create profile on sign-up ─────────────────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── Roles ───────────────────────────────────────────────────

create type public.member_role as enum ('owner', 'admin', 'manager', 'employee');


-- ── Organisations ───────────────────────────────────────────

create table public.organisations (
  id          uuid default gen_random_uuid() primary key,
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now()
);

alter table public.organisations enable row level security;


-- ── Organisation Members ────────────────────────────────────

create table public.organisation_members (
  id          uuid default gen_random_uuid() primary key,
  org_id      uuid not null references public.organisations on delete cascade,
  user_id     uuid not null references public.profiles on delete cascade,
  role        public.member_role not null default 'employee',
  invited_by  uuid references public.profiles,
  joined_at   timestamptz not null default now(),
  unique(org_id, user_id)
);

alter table public.organisation_members enable row level security;

-- Members can see other members in their org
create policy "Members can view org members"
  on public.organisation_members for select
  using (
    exists (
      select 1 from public.organisation_members as om
      where om.org_id = organisation_members.org_id
      and om.user_id = auth.uid()
    )
  );

-- Only owners and admins can insert new members
create policy "Owners and admins can add members"
  on public.organisation_members for insert
  with check (
    exists (
      select 1 from public.organisation_members as om
      where om.org_id = organisation_members.org_id
      and om.user_id = auth.uid()
      and om.role in ('owner', 'admin')
    )
  );

-- Only owners and admins can update member roles
create policy "Owners and admins can update members"
  on public.organisation_members for update
  using (
    exists (
      select 1 from public.organisation_members as om
      where om.org_id = organisation_members.org_id
      and om.user_id = auth.uid()
      and om.role in ('owner', 'admin')
    )
  );

-- Only owners and admins can remove members
create policy "Owners and admins can remove members"
  on public.organisation_members for delete
  using (
    exists (
      select 1 from public.organisation_members as om
      where om.org_id = organisation_members.org_id
      and om.user_id = auth.uid()
      and om.role in ('owner', 'admin')
    )
  );


-- ── Organisations RLS (after members table exists) ──────────

create policy "Members can view their organisation"
  on public.organisations for select
  using (
    exists (
      select 1 from public.organisation_members
      where org_id = organisations.id
      and user_id = auth.uid()
    )
  );
