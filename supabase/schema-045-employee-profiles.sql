create table if not exists employee_profiles (
  user_id                  uuid references auth.users on delete cascade primary key,
  org_id                   uuid references organisations on delete cascade not null,
  job_title                text,
  start_date               date,
  emergency_contact_name   text,
  emergency_contact_phone  text,
  avatar_url               text,
  created_at               timestamptz default now() not null,
  updated_at               timestamptz default now() not null
);
alter table employee_profiles enable row level security;
create policy "org members read profiles" on employee_profiles for select
  using (org_id in (select org_id from organisation_members where user_id = auth.uid()));
create policy "members upsert own profile" on employee_profiles for insert
  with check (user_id = auth.uid());
create policy "members update own profile" on employee_profiles for update
  using (user_id = auth.uid());
create policy "managers upsert any profile" on employee_profiles for insert
  with check (org_id in (select org_id from organisation_members where user_id = auth.uid() and role in ('owner','admin','manager')));
create policy "managers update any profile" on employee_profiles for update
  using (org_id in (select org_id from organisation_members where user_id = auth.uid() and role in ('owner','admin','manager')));

create table if not exists employee_documents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users on delete cascade not null,
  org_id        uuid references organisations on delete cascade not null,
  label         text not null,
  storage_path  text not null,
  uploaded_at   timestamptz default now() not null
);
alter table employee_documents enable row level security;
create policy "members read own docs" on employee_documents for select using (user_id = auth.uid());
create policy "managers read org docs" on employee_documents for select
  using (org_id in (select org_id from organisation_members where user_id = auth.uid() and role in ('owner','admin','manager')));
create policy "members insert own docs" on employee_documents for insert with check (user_id = auth.uid());
create policy "managers insert org docs" on employee_documents for insert
  with check (org_id in (select org_id from organisation_members where user_id = auth.uid() and role in ('owner','admin','manager')));
create policy "owner deletes own doc" on employee_documents for delete using (user_id = auth.uid());
create policy "managers delete org docs" on employee_documents for delete
  using (org_id in (select org_id from organisation_members where user_id = auth.uid() and role in ('owner','admin','manager')));
