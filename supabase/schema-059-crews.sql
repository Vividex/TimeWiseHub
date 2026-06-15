-- Crews: named groups with a designated manager for approval routing
create table public.crews (
  id         uuid default gen_random_uuid() primary key,
  org_id     uuid not null references public.organisations on delete cascade,
  name       text not null,
  manager_id uuid not null references public.profiles on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.crews enable row level security;

create policy "Org members can view their org crews"
  on public.crews for select
  using (
    exists (
      select 1 from public.organisation_members om
      where om.org_id = crews.org_id and om.user_id = auth.uid()
    )
  );

create policy "Org admins can manage crews"
  on public.crews for all
  using (
    exists (
      select 1 from public.organisation_members om
      where om.org_id = crews.org_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

-- Crew membership: employees can belong to multiple crews
create table public.crew_members (
  crew_id uuid not null references public.crews on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  primary key (crew_id, user_id)
);

alter table public.crew_members enable row level security;

create policy "Org members can view crew members"
  on public.crew_members for select
  using (
    exists (
      select 1 from public.crews c
      join public.organisation_members om on om.org_id = c.org_id
      where c.id = crew_members.crew_id and om.user_id = auth.uid()
    )
  );

create policy "Org admins can manage crew members"
  on public.crew_members for all
  using (
    exists (
      select 1 from public.crews c
      join public.organisation_members om on om.org_id = c.org_id
      where c.id = crew_members.crew_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

create index crews_org on public.crews (org_id);
create index crew_members_crew on public.crew_members (crew_id);
create index crew_members_user on public.crew_members (user_id);
