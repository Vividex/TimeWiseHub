-- ============================================================
-- TimeWiseHub — Schema 032: Revenue visibility (per-client + walk-in)
-- ============================================================

alter table public.income_entries
  add column client_id uuid references public.clients(id) on delete set null;

create index income_entries_client on public.income_entries (client_id) where client_id is not null;

alter table public.income_entries
  drop constraint income_entries_source_type_check;
alter table public.income_entries
  add constraint income_entries_source_type_check
  check (source_type in ('manual', 'invoice', 'sale'));

alter table public.clients
  add column is_walkin boolean not null default false;

-- Backfill invoice-sourced income to the invoice's client.
update public.income_entries ie
set client_id = i.client_id
from public.invoices i
where ie.invoice_id = i.id and ie.client_id is null;
