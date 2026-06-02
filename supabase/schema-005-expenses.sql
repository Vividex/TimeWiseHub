-- ============================================================
-- TimeWiseHub — Schema 005: Expenses
-- Run in Supabase SQL Editor
-- ============================================================


-- ── Expense status ───────────────────────────────────────────

create type public.expense_status as enum ('draft', 'submitted', 'approved', 'rejected');


-- ── Expense categories ───────────────────────────────────────

create table public.expense_categories (
  id      uuid default gen_random_uuid() primary key,
  org_id  uuid references public.organisations on delete cascade,
  name    text not null,
  -- null org_id = global default category
  unique(org_id, name)
);

alter table public.expense_categories enable row level security;

create policy "Members can view their org categories"
  on public.expense_categories for select
  using (
    org_id is null or
    exists (
      select 1 from public.organisation_members om
      where om.org_id = expense_categories.org_id
      and om.user_id = auth.uid()
    )
  );

create policy "Owners and admins can manage categories"
  on public.expense_categories for all
  using (
    exists (
      select 1 from public.organisation_members om
      where om.org_id = expense_categories.org_id
      and om.user_id = auth.uid()
      and om.role in ('owner', 'admin')
    )
  );

-- Default global categories
insert into public.expense_categories (name) values
  ('Travel'), ('Accommodation'), ('Meals'), ('Equipment'),
  ('Software'), ('Office Supplies'), ('Marketing'), ('Other');


-- ── Expenses ─────────────────────────────────────────────────

create table public.expenses (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid not null references public.profiles on delete cascade,
  org_id          uuid references public.organisations on delete cascade,
  category_id     uuid references public.expense_categories,
  amount          numeric(10, 2) not null,
  currency        text not null default 'AUD',
  description     text,
  expense_date    date not null default current_date,
  receipt_path    text,
  status          public.expense_status not null default 'draft',
  reviewed_by     uuid references public.profiles,
  reviewed_at     timestamptz,
  review_note     text,
  created_at      timestamptz not null default now()
);

alter table public.expenses enable row level security;

create policy "Users can manage their own expenses"
  on public.expenses for all
  using (auth.uid() = user_id);

create policy "Managers can view org expenses"
  on public.expenses for select
  using (
    exists (
      select 1 from public.organisation_members viewer
      join public.organisation_members target
        on viewer.org_id = target.org_id
      where viewer.user_id = auth.uid()
        and target.user_id = expenses.user_id
        and viewer.role in ('owner', 'admin', 'manager')
    )
  );

create policy "Managers can update expense status"
  on public.expenses for update
  using (
    exists (
      select 1 from public.organisation_members viewer
      join public.organisation_members target
        on viewer.org_id = target.org_id
      where viewer.user_id = auth.uid()
        and target.user_id = expenses.user_id
        and viewer.role in ('owner', 'admin', 'manager')
    )
  );

create index expenses_user_date on public.expenses (user_id, expense_date desc);
create index expenses_org_status on public.expenses (org_id, status);
