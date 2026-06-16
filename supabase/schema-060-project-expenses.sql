create table if not exists project_expenses (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  org_id       uuid references organisations(id),
  created_by   uuid not null references auth.users(id),
  description  text not null,
  amount       numeric(10,2) not null check (amount >= 0),
  expense_date date not null default current_date,
  category     text check (category in ('materials', 'equipment', 'subcontractor', 'other')),
  created_at   timestamptz default now()
);

alter table project_expenses enable row level security;

-- Org members can read expenses for projects in their org; personal projects visible to creator
create policy "org members can read project expenses"
  on project_expenses for select
  using (
    (org_id is not null and org_id in (
      select org_id from organisation_members where user_id = auth.uid()
    ))
    or created_by = auth.uid()
  );

-- Any authenticated org member (or owner of a personal project) can log an expense
create policy "org members can insert project expenses"
  on project_expenses for insert
  with check (created_by = auth.uid());

-- Creator or org admin/owner can delete
create policy "creator or admin can delete project expenses"
  on project_expenses for delete
  using (
    created_by = auth.uid()
    or (
      org_id is not null and org_id in (
        select org_id from organisation_members
        where user_id = auth.uid()
        and role in ('owner', 'admin')
      )
    )
  );
