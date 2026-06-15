create table if not exists user_onboarding_dismissed (
  user_id      uuid references auth.users on delete cascade primary key,
  org_id       uuid references organisations on delete cascade,
  dismissed_at timestamptz default now() not null
);
alter table user_onboarding_dismissed enable row level security;
create policy "users manage own dismissal" on user_onboarding_dismissed
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
