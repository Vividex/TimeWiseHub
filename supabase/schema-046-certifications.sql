create table if not exists certifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users on delete cascade not null,
  org_id         uuid references organisations on delete cascade not null,
  name           text not null,
  issued_date    date,
  expiry_date    date,
  document_path  text,
  created_at     timestamptz default now() not null
);
alter table certifications enable row level security;
create policy "members read own certs" on certifications for select using (user_id = auth.uid());
create policy "managers read org certs" on certifications for select
  using (org_id in (select org_id from organisation_members where user_id = auth.uid() and role in ('owner','admin','manager')));
create policy "members insert own certs" on certifications for insert with check (user_id = auth.uid());
create policy "managers insert org certs" on certifications for insert
  with check (org_id in (select org_id from organisation_members where user_id = auth.uid() and role in ('owner','admin','manager')));
create policy "members update own certs" on certifications for update using (user_id = auth.uid());
create policy "managers update org certs" on certifications for update
  using (org_id in (select org_id from organisation_members where user_id = auth.uid() and role in ('owner','admin','manager')));
create policy "members delete own certs" on certifications for delete using (user_id = auth.uid());
create policy "managers delete org certs" on certifications for delete
  using (org_id in (select org_id from organisation_members where user_id = auth.uid() and role in ('owner','admin','manager')));
