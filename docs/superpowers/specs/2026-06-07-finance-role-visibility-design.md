# Finance Role-Gated Visibility — Design (Subsystem 1)

> **Staging note:** This spec was authored by Claude in a staging location. Codex commits it to the project at `docs/superpowers/specs/2026-06-07-finance-role-visibility-design.md`. All file changes in `C:/GameForge/timewisehub` are made by Codex under Claude's guidance.

**Goal:** Make the finance area role-aware so the company owner/admin see company financials, managers see only team hours (never dollar pay or P&L), and employees see only their own time and pay — enforced first at the database, then mirrored in the UI.

**Architecture:** Two enforcement layers. Postgres Row-Level Security (RLS) is the hard boundary on every financial table ("own row, OR owner/admin of this org"). A single `resolveRole()` server helper drives page-level gating so each role is shown only the view it is permitted. `finance/page.tsx` becomes a role-router rendering one of three views.

**Tech Stack:** Next.js (App Router, server components), Supabase (Postgres + RLS), TypeScript.

---

## Scope

This is **Subsystem 1** of three. It delivers the access-control spine only.

**In scope:**
- Role resolution helper and role-router restructure of the finance page.
- RLS tightening/additions on existing financial tables (`income_entries`, `expenses`).
- The three role-specific finance views, using data that already exists today (income, expenses, time entries, timesheets).
- Fixing the known `.gte()/.lte()` query-builder bug during the rebuild.

**Out of scope (future subsystems):**
- **Subsystem 2 — Payroll/pay statements:** the `pay_statements` table, gross/PAYG/super/net calculation from approved hours × rate. The finance views here will show a "Pay statements coming soon" placeholder where pay data will later appear.
- **Subsystem 3 — Company P&L aggregation:** the full revenue − expenses − payroll roll-up. This subsystem lays the owner/admin view shell and shows revenue/expenses totals; the payroll line and net-profit calc arrive with Subsystem 3 once pay data exists.

**Non-goals / explicit decisions:**
- TimeWiseHub is **not** the payroll system of record (Path C). No ATO/STP lodgement, ever, in this design.
- No new role types. We use the existing `member_role` enum: `owner`, `admin`, `manager`, `employee`.

---

## Roles and Visibility Matrix

| Capability | Owner | Admin | Manager | Employee |
|---|:---:|:---:|:---:|:---:|
| Log & submit own timesheet | ✓ | ✓ | ✓ | ✓ |
| Approve / reject team timesheets | ✓ | ✓ | ✓ | ✕ |
| See own pay statement (gross/tax/net) | ✓ | ✓ | ✓ | ✓ |
| See *other* employees' pay $ amounts | ✓ | ✓ | ✕ | ✕ |
| See team *hours* (no $) for approval | ✓ | ✓ | ✓ | ✕ |
| See company P&L (revenue/expenses/profit) | ✓ | ✓ | ✕ | ✕ |
| Set employees' hourly rates | ✓ | ✓ | ✕ | ✕ |

**Role groupings derived from the matrix:**
- **Financial roles** = `owner`, `admin` — full financial visibility across the org.
- **Operational role** = `manager` — team hours and approvals, no dollar figures, no P&L.
- **Self-only role** = `employee` — own time and own pay only.

---

## Layer 1 — Database (RLS)

The database is the real boundary. RLS is written so that no client query, regardless of UI, can read data the role isn't entitled to.

### 1.1 Tighten `income_entries`

The current `org_manager_read` policy grants `SELECT` to `owner`, `admin`, **and `manager`**. This is a live privacy leak — managers can read company revenue today. Replace it so only financial roles get org-wide read; per-user own-row access is unchanged.

```sql
-- Replace the over-permissive manager policy on income_entries.
drop policy if exists "org_manager_read" on income_entries;

create policy "org_financial_read" on income_entries for select
  using (
    org_id is not null and
    org_id in (
      select org_id from organisation_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );
```

The existing `owner_all` policy (`user_id = auth.uid()`) remains so every user keeps full access to their own income rows.

### 1.2 `expenses` — no change required

Verified against `schema-005-expenses.sql`: `expenses` already has an `org_id` column **and** already grants `SELECT` to `owner`/`admin`/`manager` via the existing "Managers can view org expenses" policy. That manager access is **intentional** — expenses have an approval workflow ("Managers can update expense status") that requires managers to read the claims they review.

Therefore we do **not** add or alter any expenses policy. Critically, we must **not** strip manager read from `expenses`, or we break expense approval. This is safe for the privacy goal: company *profit/loss* requires revenue, and managers cannot read revenue (§1.1). Without revenue, the expense rows a manager can see for approval do not reveal the company P&L. The P&L *view* itself is additionally gated at the application layer (managers never receive the company view).

### 1.3 Migration packaging

The single RLS change ships as one new migration file, `supabase/schema-029-finance-role-visibility.sql` (028 is already taken by `schema-028-project-entitlements.sql`), following the existing `schema-0XX` convention. It is idempotent (`drop policy if exists` before `create policy`).

---

## Layer 2 — Application (role resolution + routing)

### 2.1 `resolveRole()` helper

A single server-side source of truth for the current user's role in their organisation. All gating decisions flow through it; no component reads `organisation_members.role` directly.

```ts
// src/lib/auth/resolve-role.ts
import { createClient } from '@/lib/supabase-server'

export type MemberRole = 'owner' | 'admin' | 'manager' | 'employee'

export type RoleContext = {
  userId: string
  orgId: string | null
  role: MemberRole | null
  isFinancial: boolean   // owner | admin
  isManager: boolean     // owner | admin | manager (can approve)
}

export async function resolveRole(): Promise<RoleContext | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  const role = (membership?.role ?? null) as MemberRole | null
  return {
    userId: user.id,
    orgId: membership?.org_id ?? null,
    role,
    isFinancial: role === 'owner' || role === 'admin',
    isManager: role === 'owner' || role === 'admin' || role === 'manager',
  }
}
```

### 2.2 Finance page becomes a role-router

`finance/page.tsx` resolves the role once and delegates to one view component. No financial query is issued for a role that may not see its result — the page never even fetches company income for an employee.

```
finance/page.tsx -> resolveRole(), redirect to /login if no user
  ├─ isFinancial && orgId  -> <CompanyFinanceView scope={org}  />   (owner/admin)
  ├─ !orgId                -> <CompanyFinanceView scope={user} />   (solo user — personal P&L, current behaviour)
  ├─ role === 'manager'    -> <TeamApprovalsView orgId userId />    (manager)
  └─ else                  -> <EmployeeFinanceView userId />        (org employee)
```

**Solo-user note:** a user with no organisation membership is their own business — they keep the existing personal income/expenses P&L. `CompanyFinanceView` therefore takes a `scope` discriminator (`{ type: 'org', orgId }` vs `{ type: 'user', userId }`) and switches its query filter accordingly; the layout is identical. This reuses one view for both cases and avoids regressing solo users.

### 2.3 The three views

- **`CompanyFinanceView`** (owner/admin org-scoped, or solo user user-scoped): period filter (this is where the `.gte()/.lte()` bug is fixed — see below); revenue total from `income_entries`, expenses total from `expenses`, the existing 6-month chart, and the `IncomeForm` to add revenue. Query filter is `org_id = orgId` for the org scope and `user_id = userId` for the solo scope. A payroll line and net-profit figure are stubbed with "Coming with payroll" until Subsystem 3. Drill-down into individual pay is stubbed until Subsystem 2.
- **`TeamApprovalsView`** (manager): list of team members' timesheets needing approval, showing **hours only** (no rates, no dollar amounts), plus the manager's own pay statement placeholder. Uses existing manager RLS on `time_entries`/`timesheets`.
- **`EmployeeFinanceView`** (employee): own time summary and own pay statement placeholder. No org data fetched.

### 2.4 Query-builder bug fix

Inside `CompanyFinanceView`, the period filter must reassign the builder result. The current code in `finance/page.tsx` discards `.gte()/.lte()`:

```ts
// BROKEN (current): result discarded, period filter silently ignored
if (from) incomeQuery.gte('date', from)

// CORRECT: reassign — Supabase query builders are immutable
let incomeQuery = supabase.from('income_entries').select(...)...
if (from) incomeQuery = incomeQuery.gte('date', from)
if (to)   incomeQuery = incomeQuery.lte('date', to)
```

---

## Error Handling

- **No authenticated user:** `redirect('/login')` (existing behaviour).
- **No organisation membership** (`orgId === null`): solo user — render `CompanyFinanceView` in `user` scope (personal income/expenses P&L). Preserves existing behaviour; do not error.
- **Null/role missing:** default to the most restrictive view (self-only). Fail closed, never open.
- **RLS denies a read:** Supabase returns empty data, not an error; views render their empty state ("No data for this period"). The page must not crash on `null` data.

---

## Testing

Because the security guarantee lives in RLS, tests assert at the database boundary, not just the UI.

1. **RLS policy tests** (per role, via separate authenticated Supabase clients):
   - Employee querying `income_entries` for the org returns only their own rows.
   - Manager querying `income_entries`/`expenses` org-wide returns **zero** company rows.
   - Owner and Admin querying org-wide return all rows.
2. **`resolveRole()` unit tests:** correct `isFinancial`/`isManager` flags for each of the four roles, and the null-membership case.
3. **Role-router tests:** each role renders its intended view component; employee never triggers a company income fetch.

---

## Files

- Create: `supabase/schema-029-finance-role-visibility.sql` (RLS migration)
- Create: `src/lib/auth/resolve-role.ts`
- Create: `src/components/finance/CompanyFinanceView.tsx`
- Create: `src/components/finance/TeamApprovalsView.tsx`
- Create: `src/components/finance/EmployeeFinanceView.tsx`
- Modify: `src/app/dashboard/finance/page.tsx` (becomes role-router; the `.gte()/.lte()` bug fix moves into `CompanyFinanceView`)

---

## Verification approach

The repo has **no test runner** (no jest/vitest, no `test` script; the only `*.test.*` files are inside `node_modules`). Rather than bolt a framework onto a zero-test codebase, verification uses the project's real gates plus direct database checks:

- **RLS (security-critical):** verified directly against Postgres via the Supabase MCP — inspect `pg_policies`, then simulate each role with `request.jwt.claims` inside a transaction and assert what each role can read. This is the meaningful test for this subsystem.
- **App code:** `pnpm build` (TypeScript compile catches signature/type errors) and `pnpm lint`, plus a manual smoke check of the finance page under each role.

## Resolved facts (verified against the codebase)

1. `expenses` already has `org_id` and an owner/admin/manager read policy — no expenses migration needed (§1.2).
2. No test framework exists — see Verification approach above.
3. `member_role` enum is exactly `('owner','admin','manager','employee')` (`schema-001-auth.sql:48`).
4. Next migration number is `029` (`028` is `schema-028-project-entitlements.sql`).
