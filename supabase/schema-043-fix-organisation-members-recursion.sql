-- TimeWiseHub — Schema 043: Fix organisation_members RLS recursion
-- The original organisation_members policies queried organisation_members from
-- inside policies on the same table, which can trigger Postgres' recursive RLS
-- protection when org settings update member rows.

create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.organisation_members om
    where om.org_id = p_org_id
      and om.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(
  p_org_id uuid,
  p_roles public.member_role[]
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.organisation_members om
    where om.org_id = p_org_id
      and om.user_id = auth.uid()
      and om.role = any(p_roles)
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.has_org_role(uuid, public.member_role[]) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.member_role[]) to authenticated;

drop policy if exists "Members can view org members" on public.organisation_members;
drop policy if exists "Owners and admins can add members" on public.organisation_members;
drop policy if exists "Owners and admins can update members" on public.organisation_members;
drop policy if exists "Owners and admins can remove members" on public.organisation_members;

create policy "Members can view org members"
  on public.organisation_members
  for select
  using (public.is_org_member(org_id));

create policy "Owners and admins can add members"
  on public.organisation_members
  for insert
  with check (
    public.has_org_role(org_id, array['owner', 'admin']::public.member_role[])
  );

create policy "Owners and admins can update members"
  on public.organisation_members
  for update
  using (
    public.has_org_role(org_id, array['owner', 'admin']::public.member_role[])
  )
  with check (
    public.has_org_role(org_id, array['owner', 'admin']::public.member_role[])
  );

create policy "Owners and admins can remove members"
  on public.organisation_members
  for delete
  using (
    public.has_org_role(org_id, array['owner', 'admin']::public.member_role[])
  );

drop policy if exists "Members can view their organisation" on public.organisations;
drop policy if exists "Owners and admins can update organisation settings" on public.organisations;

create policy "Members can view their organisation"
  on public.organisations
  for select
  using (public.is_org_member(id));

create policy "Owners and admins can update organisation settings"
  on public.organisations
  for update
  using (
    public.has_org_role(id, array['owner', 'admin']::public.member_role[])
  )
  with check (
    public.has_org_role(id, array['owner', 'admin']::public.member_role[])
  );
