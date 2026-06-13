create extension if not exists btree_gist;

create table if not exists roster_shifts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references organisations on delete cascade not null,
  user_id     uuid references auth.users on delete cascade not null,
  date        date not null,
  start_time  time not null,
  end_time    time not null,
  notes       text,
  published   boolean default false not null,
  deleted_at  timestamptz,
  created_at  timestamptz default now() not null
);
alter table roster_shifts enable row level security;
create policy "employees read own published shifts" on roster_shifts for select
  using (user_id = auth.uid() and published = true and deleted_at is null);
create policy "managers read all org shifts" on roster_shifts for select
  using (org_id in (select org_id from organisation_members where user_id = auth.uid() and role in ('owner','admin','manager')) and deleted_at is null);
create policy "managers insert shifts" on roster_shifts for insert
  with check (org_id in (select org_id from organisation_members where user_id = auth.uid() and role in ('owner','admin','manager')));
create policy "managers update shifts" on roster_shifts for update
  using (org_id in (select org_id from organisation_members where user_id = auth.uid() and role in ('owner','admin','manager')));
create policy "managers delete shifts" on roster_shifts for delete
  using (org_id in (select org_id from organisation_members where user_id = auth.uid() and role in ('owner','admin','manager')));
