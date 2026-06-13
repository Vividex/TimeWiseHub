create table if not exists onboarding_checklists (
  id      uuid primary key default gen_random_uuid(),
  org_id  uuid references organisations on delete cascade not null unique,
  items   jsonb not null default '[]'::jsonb
);
alter table onboarding_checklists enable row level security;
create policy "org members read checklist" on onboarding_checklists for select
  using (org_id in (select org_id from organisation_members where user_id = auth.uid()));
create policy "managers upsert checklist" on onboarding_checklists for insert
  with check (org_id in (select org_id from organisation_members where user_id = auth.uid() and role in ('owner','admin','manager')));
create policy "managers update checklist" on onboarding_checklists for update
  using (org_id in (select org_id from organisation_members where user_id = auth.uid() and role in ('owner','admin','manager')));

create table if not exists onboarding_progress (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users on delete cascade not null,
  org_id       uuid references organisations on delete cascade not null,
  item_label   text not null,
  completed_at timestamptz,
  unique(user_id, org_id, item_label)
);
alter table onboarding_progress enable row level security;
create policy "members read own progress" on onboarding_progress for select using (user_id = auth.uid());
create policy "managers read org progress" on onboarding_progress for select
  using (org_id in (select org_id from organisation_members where user_id = auth.uid() and role in ('owner','admin','manager')));
create policy "members upsert own progress" on onboarding_progress for insert with check (user_id = auth.uid());
create policy "members update own progress" on onboarding_progress for update using (user_id = auth.uid());
create policy "managers upsert org progress" on onboarding_progress for insert
  with check (org_id in (select org_id from organisation_members where user_id = auth.uid() and role in ('owner','admin','manager')));
create policy "managers update org progress" on onboarding_progress for update
  using (org_id in (select org_id from organisation_members where user_id = auth.uid() and role in ('owner','admin','manager')));
