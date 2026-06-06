-- Income entries: manual income + auto-captured invoice payments
create table income_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  org_id       uuid references organisations(id) on delete cascade,
  amount       numeric(12,2) not null check (amount > 0),
  currency     text not null default 'AUD',
  category     text not null default 'Other',
  date         date not null,
  description  text,
  source_type  text not null default 'manual'
               check (source_type in ('manual', 'invoice')),
  invoice_id   uuid references invoices(id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table income_entries enable row level security;

create policy "owner_all" on income_entries for all
  using (user_id = auth.uid());

create policy "org_manager_read" on income_entries for select
  using (
    org_id is not null and
    org_id in (
      select org_id from organisation_members
      where user_id = auth.uid() and role in ('owner','admin','manager')
    )
  );
