-- ============================================================
-- TimeWiseHub — Schema 019: Invoices
-- Run in Supabase SQL Editor
-- ============================================================

create type public.invoice_status as enum ('draft', 'sent', 'paid', 'overdue', 'cancelled');

create table public.invoices (
  id                 uuid default gen_random_uuid() primary key,
  owner_id           uuid not null references public.profiles on delete cascade,
  org_id             uuid references public.organisations on delete cascade,
  client_id          uuid references public.clients on delete set null,
  invoice_number     text not null,
  status             public.invoice_status not null default 'draft',
  issue_date         date not null default current_date,
  due_date           date,
  currency           text not null default 'AUD',
  subtotal           numeric(12,2) not null default 0,
  notes              text,
  payment_link       text,
  stripe_checkout_id text,
  paid_at            timestamptz,
  created_at         timestamptz not null default now()
);

alter table public.invoices enable row level security;

create policy "Owners can manage their own invoices"
  on public.invoices for all
  using (auth.uid() = owner_id);

create policy "Org admins can manage org invoices"
  on public.invoices for all
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = invoices.org_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

create index invoices_owner  on public.invoices (owner_id, created_at desc);
create index invoices_client on public.invoices (client_id);
create index invoices_status on public.invoices (status);


-- ── Invoice line items ────────────────────────────────────────

create table public.invoice_items (
  id            uuid default gen_random_uuid() primary key,
  invoice_id    uuid not null references public.invoices on delete cascade,
  description   text not null,
  quantity      numeric(8,2) not null default 1,
  unit_price    numeric(10,2) not null,
  time_entry_id uuid references public.time_entries on delete set null,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.invoice_items enable row level security;

create policy "Invoice owners can manage items"
  on public.invoice_items for all
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and (i.owner_id = auth.uid() or exists (
          select 1 from public.organisation_members om
          where om.org_id = i.org_id and om.user_id = auth.uid()
            and om.role in ('owner', 'admin')
        ))
    )
  );

create index invoice_items_invoice on public.invoice_items (invoice_id, sort_order);


-- ── Track invoiced time entries ───────────────────────────────

alter table public.time_entries
  add column invoice_id uuid references public.invoices(id) on delete set null;

create index time_entries_invoice on public.time_entries (invoice_id) where invoice_id is not null;
