-- Enforce subscription entitlements for project creation/update.
create or replace function public.enforce_project_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_plan public.subscription_plan;
  user_status public.subscription_status;
  active_count integer;
  has_paid_plan boolean;
  has_team_plan boolean;
begin
  if new.status <> 'active' then
    return new;
  end if;

  select plan, status
    into user_plan, user_status
  from public.subscriptions
  where user_id = new.owner_id;

  has_paid_plan := user_plan in ('pro', 'team') and user_status in ('active', 'trialing');
  has_team_plan := user_plan = 'team' and user_status in ('active', 'trialing');

  if new.org_id is not null and not has_team_plan then
    raise exception 'Team plan required for organisation projects';
  end if;

  if not has_paid_plan then
    select count(*)
      into active_count
    from public.projects
    where owner_id = new.owner_id
      and status = 'active'
      and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

    if active_count >= 3 then
      raise exception 'Free plan is limited to 3 active projects';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists projects_enforce_entitlements on public.projects;
create trigger projects_enforce_entitlements
  before insert or update of status, org_id, owner_id
  on public.projects
  for each row
  execute function public.enforce_project_entitlements();

revoke execute on function public.enforce_project_entitlements() from public, anon, authenticated;
