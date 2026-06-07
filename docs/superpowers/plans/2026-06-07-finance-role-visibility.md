# Finance Role-Gated Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Staging note:** Authored by Claude in a staging location. Codex commits this plan to the repo at `docs/superpowers/plans/2026-06-07-finance-role-visibility.md` and the design spec to `docs/superpowers/specs/2026-06-07-finance-role-visibility-design.md`. Per the project workflow, **Codex makes all file changes** in `C:/GameForge/timewisehub`.

**Goal:** Make the finance area role-aware so owners/admins see company revenue & expenses, managers see only team hours (never dollar pay or P&L), and employees see only their own data — enforced first at the database (RLS), then mirrored in the UI.

**Architecture:** Two enforcement layers. A single Postgres RLS change makes company *revenue* (`income_entries`) readable only by owner/admin. A `resolveRole()` server helper is the single source of truth for role checks, and `finance/page.tsx` becomes a role-router rendering one of three view components.

**Tech Stack:** Next.js 16 (App Router, async server components), React 19, Supabase (`@supabase/ssr`, Postgres + RLS), TypeScript, Tailwind v4. Package manager: **pnpm**.

---

## Verification approach (read before starting)

**This repo has no test runner** — there is no `jest`/`vitest`, no `test` script in `package.json`, and the only `*.test.*` files live inside `node_modules`. We do **not** add a test framework to a zero-test codebase for one subsystem (YAGNI; follow existing patterns). Instead, the standard TDD "write failing test → run" steps are replaced by the project's real verification gates:

- **App/TypeScript code:** `pnpm build` (the Next.js build runs `tsc`, catching type and signature errors) and `pnpm lint`.
- **RLS (the security-critical part):** verified directly against Postgres — inspect `pg_policies`, then simulate each role with `request.jwt.claims` inside a transaction and assert what each role can read. Run these via the Supabase MCP (`mcp__supabase__execute_sql`) or the Supabase SQL editor.
- **Manual smoke:** load `/dashboard/finance` signed in as each role and confirm the correct view renders.

Commit after each task.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/schema-029-finance-role-visibility.sql` | One idempotent RLS migration: revenue readable by owner/admin only. |
| `src/lib/finance/period.ts` | Period type + helpers (`isPeriod`, `getPeriodRange`, `PERIOD_LABELS`) shared by the page and the company view. |
| `src/lib/auth/resolve-role.ts` | `resolveRole()` + pure `deriveRoleFlags()` — single source of truth for role + visibility flags. |
| `src/components/finance/CompanyFinanceView.tsx` | Revenue/expenses/chart/income-form P&L view. Dual scope: org (owner/admin) or user (solo). Contains the `.gte()/.lte()` bug fix. |
| `src/components/finance/TeamApprovalsView.tsx` | Manager view: team timesheet hours + status only. No dollar amounts. |
| `src/components/finance/EmployeeFinanceView.tsx` | Employee view: own timesheet hours + pay-statement placeholder. |
| `src/app/dashboard/finance/page.tsx` | Role-router. Resolves role once, delegates to one view. |

Build order: migration → period lib → resolveRole → leaf views (employee, manager, company) → router last (it imports all views).

---

### Task 1: RLS migration — restrict revenue to owner/admin

**Files:**
- Create: `supabase/schema-029-finance-role-visibility.sql`

Context: `schema-027-income-entries.sql` created `income_entries` with a policy `org_manager_read` that grants `SELECT` to `owner`, `admin`, **and `manager`**. Managers must not see company revenue. This is the only RLS change in the subsystem — `expenses` is deliberately left alone (managers need it for the existing expense-approval workflow, and without revenue they cannot derive profit).

- [ ] **Step 1: Write the migration file**

Create `supabase/schema-029-finance-role-visibility.sql`:

```sql
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
```

The existing `owner_all` policy (`user_id = auth.uid()`) is untouched, so every user keeps full access to their own rows.

- [ ] **Step 2: Apply the migration**

Apply via Supabase MCP:
`mcp__supabase__apply_migration` with `name: "finance_role_visibility"` and `query:` the SQL above.
(Or paste the file into the Supabase SQL editor and run it.)

- [ ] **Step 3: Verify the policy set changed**

Run via `mcp__supabase__execute_sql`:

```sql
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'income_entries'
order by policyname;
```

Expected: `org_financial_read` and `owner_all` present; `org_manager_read` **absent**.

- [ ] **Step 4: Verify role enforcement with JWT simulation**

First fetch real test IDs:

```sql
select om.user_id, om.role, om.org_id, p.email
from public.organisation_members om
join public.profiles p on p.id = om.user_id
order by om.org_id, om.role;
```

Pick an `org_id` that has both a `manager` and an `owner`. Then run the manager check (substitute the UUIDs):

```sql
begin;
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', '<MANAGER_USER_ID>', 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  select count(*) as manager_visible_income
  from public.income_entries
  where org_id = '<ORG_ID>';
rollback;
```

Expected: `manager_visible_income = 0` (manager sees no org revenue).

Then the owner check:

```sql
begin;
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', '<OWNER_USER_ID>', 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  select count(*) as owner_visible_income
  from public.income_entries
  where org_id = '<ORG_ID>';
rollback;
```

Expected: `owner_visible_income` equals the true org income row count (owner sees revenue).

- [ ] **Step 5: Commit**

```bash
git add supabase/schema-029-finance-role-visibility.sql
git commit -m "feat(finance): restrict income_entries reads to owner/admin (RLS)"
```

---

### Task 2: Period helpers library

**Files:**
- Create: `src/lib/finance/period.ts`

Context: `getPeriodRange`, `isPeriod`, and `PERIOD_LABELS` currently live inline in `finance/page.tsx`. They must be shared by the new role-router (to parse `?period=`) and `CompanyFinanceView`. Extract them verbatim into a library.

- [ ] **Step 1: Create the period library**

Create `src/lib/finance/period.ts`:

```ts
export type Period = 'month' | 'quarter' | 'year' | 'all'

export const PERIOD_LABELS: Record<Period, string> = {
  month: 'This Month',
  quarter: 'This Quarter',
  year: 'This Year',
  all: 'All Time',
}

export function isPeriod(value: string | undefined): value is Period {
  return value === 'month' || value === 'quarter' || value === 'year' || value === 'all'
}

export function getPeriodRange(period: Period): { from: string | null; to: string | null } {
  const now = new Date()
  const to = now.toISOString().slice(0, 10)

  if (period === 'all') return { from: null, to: null }

  if (period === 'month') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), to }
  }

  if (period === 'quarter') {
    const quarter = Math.floor(now.getMonth() / 3)
    return { from: new Date(now.getFullYear(), quarter * 3, 1).toISOString().slice(0, 10), to }
  }

  return { from: new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10), to }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm build`
Expected: build succeeds (no type errors). The file is not yet imported anywhere, so this just confirms it's valid.

- [ ] **Step 3: Commit**

```bash
git add src/lib/finance/period.ts
git commit -m "refactor(finance): extract period helpers into shared lib"
```

---

### Task 3: `resolveRole()` helper

**Files:**
- Create: `src/lib/auth/resolve-role.ts`

Context: single source of truth for the current user's org role and derived visibility flags. `deriveRoleFlags` is a pure function (the only piece testable without a DB). `createClient()` from `@/lib/supabase-server` is async.

- [ ] **Step 1: Create the helper**

Create `src/lib/auth/resolve-role.ts`:

```ts
import { createClient } from '@/lib/supabase-server'

export type MemberRole = 'owner' | 'admin' | 'manager' | 'employee'

export type RoleFlags = {
  /** owner or admin — full financial visibility */
  isFinancial: boolean
  /** owner, admin, or manager — can approve / see team hours */
  isManager: boolean
}

/** Pure: derive visibility flags from a role. No I/O. */
export function deriveRoleFlags(role: MemberRole | null): RoleFlags {
  return {
    isFinancial: role === 'owner' || role === 'admin',
    isManager: role === 'owner' || role === 'admin' || role === 'manager',
  }
}

export type RoleContext = {
  userId: string
  orgId: string | null
  role: MemberRole | null
} & RoleFlags

/** Resolve the signed-in user's org role. Returns null if not authenticated. */
export async function resolveRole(): Promise<RoleContext | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

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
    ...deriveRoleFlags(role),
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Sanity-check the pure logic by reasoning**

Confirm the truth table in a quick review (no runner available):
- `deriveRoleFlags('owner')` → `{ isFinancial: true, isManager: true }`
- `deriveRoleFlags('admin')` → `{ isFinancial: true, isManager: true }`
- `deriveRoleFlags('manager')` → `{ isFinancial: false, isManager: true }`
- `deriveRoleFlags('employee')` → `{ isFinancial: false, isManager: false }`
- `deriveRoleFlags(null)` → `{ isFinancial: false, isManager: false }`

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth/resolve-role.ts
git commit -m "feat(auth): add resolveRole helper as single source of truth for role gating"
```

---

### Task 4: `EmployeeFinanceView` (own data only)

**Files:**
- Create: `src/components/finance/EmployeeFinanceView.tsx`

Context: the most restrictive view. An employee sees their own recent timesheet hours and a placeholder where their pay statement will appear (Subsystem 2). It fetches **no** org-wide data. `timesheets` columns: `week_start`, `status`, `total_seconds` (`schema-020-timesheets.sql`).

- [ ] **Step 1: Create the component**

Create `src/components/finance/EmployeeFinanceView.tsx`:

```tsx
import { createClient } from '@/lib/supabase-server'

type OwnTimesheet = {
  id: string
  week_start: string
  status: string
  total_seconds: number
}

function formatHours(totalSeconds: number): string {
  return `${(totalSeconds / 3600).toFixed(2)} h`
}

export default async function EmployeeFinanceView({ userId }: { userId: string }) {
  const supabase = await createClient()

  const { data } = await supabase
    .from('timesheets')
    .select('id, week_start, status, total_seconds')
    .eq('user_id', userId)
    .order('week_start', { ascending: false })
    .limit(12)

  const timesheets = (data ?? []) as OwnTimesheet[]

  return (
    <div className="min-h-full px-4 py-8 sm:px-8 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Your pay statements</h2>
          <p className="mt-2 text-sm font-semibold text-gray-500 dark:text-slate-400">
            Coming with the payroll module. Your gross pay, tax estimate, and net pay will appear here — visible only to you and your employer.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Your recent timesheets</h2>
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {timesheets.length === 0 ? (
              <p className="px-6 py-4 text-sm font-semibold text-gray-500 dark:text-slate-400">
                No timesheets yet.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-slate-800">
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Week of</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Hours</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {timesheets.map(ts => (
                    <tr key={ts.id} className="border-b border-gray-50 last:border-0 dark:border-slate-800">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{ts.week_start}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-100">{formatHours(ts.total_seconds)}</td>
                      <td className="px-4 py-3 text-right font-semibold capitalize text-gray-600 dark:text-slate-300">{ts.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/EmployeeFinanceView.tsx
git commit -m "feat(finance): add EmployeeFinanceView (own hours + pay placeholder)"
```

---

### Task 5: `TeamApprovalsView` (manager — hours only, no dollars)

**Files:**
- Create: `src/components/finance/TeamApprovalsView.tsx`

Context: a manager sees their team's timesheets to review, showing **hours and status only — never rates or pay**. The existing "Managers can view org member timesheets" RLS policy already permits this read. `timesheets.user_id` and `timesheets.reviewed_by` both reference `profiles`, so the embed must disambiguate with the FK hint `profiles!timesheets_user_id_fkey`. A manager's own pay statement is a placeholder (Subsystem 2).

- [ ] **Step 1: Create the component**

Create `src/components/finance/TeamApprovalsView.tsx`:

```tsx
import { createClient } from '@/lib/supabase-server'

type TeamTimesheet = {
  id: string
  user_id: string
  week_start: string
  status: string
  total_seconds: number
  profiles: { full_name: string | null; email: string } | null
}

function formatHours(totalSeconds: number): string {
  return `${(totalSeconds / 3600).toFixed(2)} h`
}

export default async function TeamApprovalsView({ orgId, userId }: { orgId: string; userId: string }) {
  const supabase = await createClient()

  const { data } = await supabase
    .from('timesheets')
    .select('id, user_id, week_start, status, total_seconds, profiles!timesheets_user_id_fkey(full_name, email)')
    .eq('org_id', orgId)
    .in('status', ['submitted', 'approved', 'rejected'])
    .order('week_start', { ascending: false })
    .limit(50)

  const timesheets = (data ?? []) as unknown as TeamTimesheet[]
  const pending = timesheets.filter(t => t.status === 'submitted')

  return (
    <div className="min-h-full px-4 py-8 sm:px-8 dark:bg-slate-950">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Team timesheets</h2>
          <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-slate-400">
            {pending.length} awaiting your review. Hours only — pay amounts are not shown to managers.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {timesheets.length === 0 ? (
            <p className="px-6 py-4 text-sm font-semibold text-gray-500 dark:text-slate-400">
              No submitted timesheets.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-slate-800">
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Week of</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Hours</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {timesheets.map(ts => (
                  <tr key={ts.id} className="border-b border-gray-50 last:border-0 dark:border-slate-800">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {ts.profiles?.full_name ?? ts.profiles?.email ?? 'Unknown'}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{ts.week_start}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-100">{formatHours(ts.total_seconds)}</td>
                    <td className="px-4 py-3 text-right font-semibold capitalize text-gray-600 dark:text-slate-300">{ts.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Your pay statement</h2>
          <p className="mt-2 text-sm font-semibold text-gray-500 dark:text-slate-400">
            Coming with the payroll module — visible only to you and your employer.
          </p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm build`
Expected: build succeeds. If the build reports an embedding error on the `profiles!timesheets_user_id_fkey` hint, verify the FK constraint name with:
`select conname from pg_constraint where conrelid = 'public.timesheets'::regclass and contype = 'f';`
and substitute the actual `user_id` FK name.

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/TeamApprovalsView.tsx
git commit -m "feat(finance): add TeamApprovalsView (team hours, no pay amounts)"
```

---

### Task 6: `CompanyFinanceView` (owner/admin org P&L; solo user personal P&L)

**Files:**
- Create: `src/components/finance/CompanyFinanceView.tsx`

Context: the P&L view. It carries the **fix for the known query-builder bug** (the current `finance/page.tsx` discards `.gte()/.lte()` results because the builder is immutable). It reuses existing components: `FinanceSummary` (`totalIncome`, `totalExpenses`, `currency`), `FinanceChart` (`months: MonthBar[]`), `IncomeForm` (`userId`, `orgId`), `IncomeList` (`entries`). It is scope-aware: `{ type:'org', orgId }` filters by `org_id` (owner/admin, RLS-allowed); `{ type:'user', userId }` filters by `user_id` (solo user). Payroll and net profit are stubbed until Subsystems 2/3.

- [ ] **Step 1: Create the component**

Create `src/components/finance/CompanyFinanceView.tsx`:

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import FinanceSummary from '@/components/finance/FinanceSummary'
import FinanceChart, { type MonthBar } from '@/components/finance/FinanceChart'
import IncomeForm from '@/components/finance/IncomeForm'
import IncomeList from '@/components/finance/IncomeList'
import { PERIOD_LABELS, getPeriodRange, type Period } from '@/lib/finance/period'

export type FinanceScope = { type: 'org'; orgId: string } | { type: 'user'; userId: string }

type IncomeEntry = {
  id: string
  amount: number
  currency: string
  category: string
  date: string
  description: string | null
  source_type: string
}

type ExpenseEntry = {
  amount: number
  expense_date: string
}

function getMonthlyData(
  incomeEntries: Pick<IncomeEntry, 'amount' | 'date'>[],
  expenses: ExpenseEntry[],
): MonthBar[] {
  const months: MonthBar[] = []
  const now = new Date()

  for (let i = 5; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const label = monthStart.toLocaleString('en-AU', { month: 'short' })
    const year = monthStart.getFullYear()
    const month = monthStart.getMonth()

    const income = incomeEntries
      .filter(entry => {
        const date = new Date(entry.date)
        return date.getFullYear() === year && date.getMonth() === month
      })
      .reduce((sum, entry) => sum + Number(entry.amount), 0)

    const expenseTotal = expenses
      .filter(entry => {
        const date = new Date(entry.expense_date)
        return date.getFullYear() === year && date.getMonth() === month
      })
      .reduce((sum, entry) => sum + Number(entry.amount), 0)

    months.push({ label, income, expenses: expenseTotal })
  }

  return months
}

export default async function CompanyFinanceView({
  scope,
  period,
  currentUserId,
  currentOrgId,
}: {
  scope: FinanceScope
  period: Period
  currentUserId: string
  currentOrgId: string | null
}) {
  const supabase = await createClient()
  const { from, to } = getPeriodRange(period)

  const scopeColumn = scope.type === 'org' ? 'org_id' : 'user_id'
  const scopeValue = scope.type === 'org' ? scope.orgId : scope.userId
  const heading = scope.type === 'org' ? 'Company Finance' : 'My Finance'

  // NOTE: Supabase query builders are immutable — .gte()/.lte() return NEW
  // builders and MUST be reassigned. The old finance/page.tsx dropped them,
  // silently ignoring the period filter. Fixed here with `let` + reassignment.
  let incomeQuery = supabase
    .from('income_entries')
    .select('id, amount, currency, category, date, description, source_type')
    .eq(scopeColumn, scopeValue)
    .order('date', { ascending: false })

  let expenseQuery = supabase
    .from('expenses')
    .select('amount, expense_date')
    .eq(scopeColumn, scopeValue)
    .order('expense_date', { ascending: false })

  if (from) {
    incomeQuery = incomeQuery.gte('date', from)
    expenseQuery = expenseQuery.gte('expense_date', from)
  }

  if (to) {
    incomeQuery = incomeQuery.lte('date', to)
    expenseQuery = expenseQuery.lte('expense_date', to)
  }

  const [incomeResult, expenseResult, allIncomeResult, allExpenseResult] = await Promise.all([
    incomeQuery,
    expenseQuery,
    supabase.from('income_entries').select('amount, date').eq(scopeColumn, scopeValue),
    supabase.from('expenses').select('amount, expense_date').eq(scopeColumn, scopeValue),
  ])

  const incomeEntries = (incomeResult.data ?? []) as IncomeEntry[]
  const expenses = (expenseResult.data ?? []) as ExpenseEntry[]
  const totalIncome = incomeEntries.reduce((sum, entry) => sum + Number(entry.amount), 0)
  const totalExpenses = expenses.reduce((sum, entry) => sum + Number(entry.amount), 0)
  const monthlyData = getMonthlyData(allIncomeResult.data ?? [], allExpenseResult.data ?? [])

  return (
    <div className="min-h-full px-4 py-8 sm:px-8 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{heading}</h1>

        <div className="flex flex-wrap gap-2">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <Link
              key={p}
              href={`/dashboard/finance?period=${p}`}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                period === p
                  ? 'bg-cyan-500 text-white'
                  : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {PERIOD_LABELS[p]}
            </Link>
          ))}
        </div>

        <FinanceSummary totalIncome={totalIncome} totalExpenses={totalExpenses} currency="AUD" />
        <FinanceChart months={monthlyData} />

        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Payroll &amp; net profit</h2>
          <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-slate-400">
            Coming with the payroll module — payroll costs and net profit will roll up here.
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Income</h2>
            <IncomeForm userId={currentUserId} orgId={currentOrgId} />
          </div>
          <IncomeList entries={incomeEntries} />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Expenses</h2>
            <Link href="/dashboard/expenses" className="text-sm font-semibold text-cyan-600 hover:underline">
              View all
            </Link>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {expenses.length === 0 ? (
              <p className="px-6 py-4 text-sm font-semibold text-gray-500 dark:text-slate-400">
                No expenses in this period.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-slate-800">
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Date</th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.slice(0, 10).map((expense, index) => (
                      <tr key={`${expense.expense_date}-${index}`} className="border-b border-gray-50 last:border-0 dark:border-slate-800">
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{expense.expense_date}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600 dark:text-red-400">
                          {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(expense.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm build`
Expected: build succeeds. (Confirm `FinanceChart` exports `MonthBar` and `FinanceSummary`/`IncomeForm`/`IncomeList` prop names match — they are used identically to the original `finance/page.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/CompanyFinanceView.tsx
git commit -m "feat(finance): add CompanyFinanceView with period-filter bug fix and scope support"
```

---

### Task 7: Role-router `finance/page.tsx`

**Files:**
- Modify: `src/app/dashboard/finance/page.tsx` (full replacement — old personal-only logic is superseded)

Context: the page resolves the role once and delegates. No financial query runs for a role that can't see it. Solo users (no org) keep their personal P&L via `CompanyFinanceView` in user scope. `redirect()` returns `never`, so `ctx` is non-null afterward.

- [ ] **Step 1: Replace the page with the router**

Replace the entire contents of `src/app/dashboard/finance/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'
import { resolveRole } from '@/lib/auth/resolve-role'
import { isPeriod, type Period } from '@/lib/finance/period'
import CompanyFinanceView, { type FinanceScope } from '@/components/finance/CompanyFinanceView'
import TeamApprovalsView from '@/components/finance/TeamApprovalsView'
import EmployeeFinanceView from '@/components/finance/EmployeeFinanceView'

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const ctx = await resolveRole()
  if (!ctx) redirect('/login')

  const params = await searchParams
  const period: Period = isPeriod(params.period) ? params.period : 'month'

  // Owner / admin of an org → company P&L.
  if (ctx.isFinancial && ctx.orgId) {
    const scope: FinanceScope = { type: 'org', orgId: ctx.orgId }
    return (
      <CompanyFinanceView scope={scope} period={period} currentUserId={ctx.userId} currentOrgId={ctx.orgId} />
    )
  }

  // Solo user (no organisation) → personal P&L, preserving prior behaviour.
  if (!ctx.orgId) {
    const scope: FinanceScope = { type: 'user', userId: ctx.userId }
    return (
      <CompanyFinanceView scope={scope} period={period} currentUserId={ctx.userId} currentOrgId={null} />
    )
  }

  // Manager → team hours + own pay placeholder.
  if (ctx.role === 'manager') {
    return <TeamApprovalsView orgId={ctx.orgId} userId={ctx.userId} />
  }

  // Employee → own data only.
  return <EmployeeFinanceView userId={ctx.userId} />
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm build`
Expected: build succeeds with no type errors.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: no errors in the changed files.

- [ ] **Step 4: Manual smoke test**

Run `pnpm dev`, sign in, and load `/dashboard/finance` as each role:
- Owner/admin (in org): sees "Company Finance", period tabs work (change period → totals change — confirms the bug fix), income form present.
- Manager: sees "Team timesheets" with hours/status, **no dollar amounts**, no period tabs.
- Employee: sees own timesheets + "pay statements coming" placeholder only.
- Solo user (no org): sees "My Finance" with their own income/expenses (unchanged behaviour).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/finance/page.tsx
git commit -m "feat(finance): role-router for finance page (owner/admin/manager/employee)"
```

---

### Task 8: Commit the design + plan docs

**Files:**
- Create: `docs/superpowers/specs/2026-06-07-finance-role-visibility-design.md` (from staging)
- Create: `docs/superpowers/plans/2026-06-07-finance-role-visibility.md` (from staging, this file)

- [ ] **Step 1: Copy both staged docs into the repo**

Copy `C:\Users\Abbot\brainstorm-timewisehub\specs\2026-06-07-finance-role-visibility-design.md` → `docs/superpowers/specs/` and `C:\Users\Abbot\brainstorm-timewisehub\plans\2026-06-07-finance-role-visibility.md` → `docs/superpowers/plans/` in the repo.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-06-07-finance-role-visibility-design.md docs/superpowers/plans/2026-06-07-finance-role-visibility.md
git commit -m "docs(finance): add role-visibility design spec and implementation plan"
```

---

## Self-Review

**1. Spec coverage:**
- Visibility matrix (revenue owner/admin-only) → Task 1 (RLS) + enforced in views. ✓
- `resolveRole()` single source of truth → Task 3. ✓
- Three role views → Tasks 4, 5, 6. ✓
- Role-router restructure → Task 7. ✓
- `.gte()/.lte()` bug fix → Task 6 (folded into CompanyFinanceView). ✓
- Solo-user no-regression → Task 6 scope + Task 7 routing. ✓
- Expenses untouched (managers keep approval access) → documented in Task 1 context; no task needed. ✓
- Payroll/net + individual-pay stubs (Subsystems 2/3 boundary) → placeholders in Tasks 4, 5, 6. ✓

**2. Placeholder scan:** No "TBD/TODO/handle edge cases". The UI "Coming with payroll" text is intentional product copy marking the Subsystem 2/3 boundary, not an unfinished step. ✓

**3. Type consistency:** `FinanceScope` defined in Task 6, imported in Task 7. `Period`/`isPeriod` defined in Task 2, used in Tasks 6 & 7. `resolveRole`/`RoleContext` defined in Task 3, used in Task 7 (`ctx.isFinancial`, `ctx.orgId`, `ctx.role`, `ctx.userId`). `MonthBar` imported from `FinanceChart` in Task 6 (matches original page usage). Component prop names (`FinanceSummary`, `FinanceChart`, `IncomeForm`, `IncomeList`) match the original `finance/page.tsx`. ✓

---

## Notes for the executor
- This plan covers **Subsystem 1 only**. Subsystem 2 (payroll/pay statements) and Subsystem 3 (full P&L roll-up) are separate spec → plan cycles; the placeholders here are their seams.
- If `git` is not initialised in the repo, skip the commit steps and stage changes however the project tracks them.
- The migration application (Task 1, Step 2) touches the live database, not a file — coordinate with whoever holds Supabase access if the implementer cannot apply it directly.
