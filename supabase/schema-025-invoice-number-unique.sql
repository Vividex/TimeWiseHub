-- ============================================================
-- TimeWiseHub — Schema 025: Invoice number uniqueness constraint
-- Run in Supabase SQL Editor
--
-- Prevents duplicate invoice numbers from a race condition in
-- the invoice creation route. Check for existing duplicates
-- before running: SELECT owner_id, invoice_number, COUNT(*)
-- FROM invoices GROUP BY owner_id, invoice_number HAVING COUNT(*) > 1;
-- ============================================================

alter table public.invoices
  add constraint invoices_owner_number_unique unique (owner_id, invoice_number);
