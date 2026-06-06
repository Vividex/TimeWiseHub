-- ============================================================
-- TimeWiseHub — Schema 029: Finance role-gated visibility
-- Restrict company revenue (income_entries) reads to owner/admin.
-- Managers must not see revenue (and therefore cannot derive profit).
-- Run in Supabase SQL Editor or via apply_migration.
-- ============================================================

-- Drop the over-permissive policy that included 'manager'.
drop policy if exists "org_manager_read" on public.income_entries;

-- Org-wide revenue reads for financial roles only.
create policy "org_financial_read" on public.income_entries for select
  using (
    org_id is not null and
    org_id in (
      select org_id from public.organisation_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );
