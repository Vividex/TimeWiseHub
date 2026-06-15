-- Add pending_approval to invoice status enum
alter type public.invoice_status add value if not exists 'pending_approval';

-- Allow all org members to read org invoices (not just admins)
create policy "Org members can view org invoices"
  on public.invoices for select
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = invoices.org_id and om.user_id = auth.uid()
    )
  );

-- Allow all org members to read org invoice items
create policy "Org members can view org invoice items"
  on public.invoice_items for select
  using (
    exists (
      select 1 from public.invoices i
      join public.organisation_members om on om.org_id = i.org_id
      where i.id = invoice_items.invoice_id
        and om.user_id = auth.uid()
        and i.org_id is not null
    )
  );
