-- ============================================================
-- TimeWiseHub — Schema 096: Business expenses
-- Adds an org-scoped "business expense" category to the existing
-- `expenses` table (amount/currency/category/recurring fields and the
-- submit->approve workflow are all reused as-is) — distinct from an
-- employee's own personal/reimbursement expenses:
--   - Only manager/admin/owner can create or view a business expense.
--   - Only admin/owner can approve/reject/delete one — this is enforced
--     at the RLS layer (not just hidden buttons), so a manager who
--     creates a business expense genuinely cannot self-approve it even
--     via a direct API call.
-- Run via Supabase MCP apply_migration (name: business_expenses)
-- ============================================================

alter table public.expenses add column is_business boolean not null default false;

-- Narrow the existing "own row" and "manager update" policies so they
-- never apply to business-scoped rows — those are governed exclusively
-- by the new business-specific policies below.

drop policy "Users can manage their own expenses" on public.expenses;
create policy "Users can manage their own personal expenses"
  on public.expenses for all
  using (auth.uid() = user_id and not is_business);

drop policy "Managers can update expense status" on public.expenses;
create policy "Managers can update personal expense status"
  on public.expenses for update
  using (
    not is_business
    and exists (
      select 1 from public.organisation_members viewer
      join public.organisation_members target
        on viewer.org_id = target.org_id
      where viewer.user_id = auth.uid()
        and target.user_id = expenses.user_id
        and viewer.role in ('owner', 'admin', 'manager')
    )
  );

-- "Managers can view org expenses" is untouched and already covers business
-- rows (it isn't scoped by is_business) — any manager/admin/owner in the same
-- org as the row's creator can already see it, which is exactly the intended
-- business-expense visibility rule.

create policy "Managers can create business expenses"
  on public.expenses for insert
  with check (
    is_business
    and user_id = auth.uid()
    and exists (
      select 1 from public.organisation_members om
      where om.org_id = expenses.org_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

create policy "Admins can review business expenses"
  on public.expenses for update
  using (
    is_business
    and exists (
      select 1 from public.organisation_members om
      where om.org_id = expenses.org_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

create policy "Admins can delete business expenses"
  on public.expenses for delete
  using (
    is_business
    and exists (
      select 1 from public.organisation_members om
      where om.org_id = expenses.org_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );
