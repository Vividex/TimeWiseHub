-- TimeWiseHub — Schema 107: Fix project_members RLS recursion
-- schema-105's "Crew members can view their project's crew" policy queried
-- project_members from inside a policy on project_members itself, which
-- Postgres detects as infinite recursion (same bug class schema-043 already
-- fixed for organisation_members). Any query touching project_members --
-- including the active-projects list's tasks/clients join -- failed with
-- "infinite recursion detected in policy for relation project_members".

create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
  );
$$;

revoke all on function public.is_project_member(uuid) from public;
grant execute on function public.is_project_member(uuid) to authenticated;

drop policy if exists "Crew members can view their project's crew" on public.project_members;

create policy "Crew members can view their project's crew"
  on public.project_members
  for select
  using (public.is_project_member(project_id));
