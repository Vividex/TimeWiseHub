# Subsystem 3 — Company P&L / Net Profit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Staging note:** Authored by Claude. Codex commits this + the spec into `docs/superpowers/` and makes all file changes in `C:/GameForge/timewisehub`. Final subsystem; builds on shipped S1 + S2.

**Goal:** Owner/admin see a company net-profit roll-up (revenue − expenses − payroll[gross+super]) for the selected period, with payroll added to the 6-month trend chart.

**Architecture:** Pure aggregation — **no migration, no new RLS.** Extend `MonthBar`/`FinanceChart` with a payroll series, add a `CompanyPnLSummary` card, wire both into `CompanyFinanceView` (org scope), replacing the S2 "Net profit" placeholder.

**Tech Stack:** Next.js 16 (async server components), React 19, Supabase (read-only), TypeScript, Tailwind v4. pnpm.

---

## Verification approach
No test runner (intentional). Verify with `pnpm build` + `pnpm lint`; pure logic (`getMonthlyData` payroll bucketing, net math) by reasoned truth table; manual owner smoke confirms the card/chart match a known pay run. Commit after each task.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/components/finance/FinanceChart.tsx` | (modify) add optional `payroll` to `MonthBar` + third bar + legend. |
| `src/components/finance/CompanyPnLSummary.tsx` | (create) presentational P&L card. |
| `src/components/finance/CompanyFinanceView.tsx` | (modify) fetch payroll, extend `getMonthlyData`, replace placeholder. |

Build order: chart (1) → summary card (2) → wiring (3) → verify/docs (4). `payroll` is **optional** on `MonthBar` so Tasks 1–2 build standalone before Task 3 populates it.

---

### Task 1: Add a payroll series to `FinanceChart`

**Files:**
- Modify: `src/components/finance/FinanceChart.tsx` (full replacement)

Context: `MonthBar` gains an **optional** `payroll` (optional so existing callers compile until Task 3). The chart renders a third indigo bar and a legend entry, and scales `maxVal` to include payroll. The expenses bar loses its right-rounding (now the middle bar); payroll takes the right-rounded slot.

- [ ] **Step 1: Replace the file**

```tsx
export type MonthBar = {
  label: string
  income: number
  expenses: number
  payroll?: number
}

export default function FinanceChart({ months }: { months: MonthBar[] }) {
  const maxVal = Math.max(...months.flatMap(m => [m.income, m.expenses, m.payroll ?? 0]), 1)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Monthly P&amp;L</h3>
      <div className="mb-4 flex items-center gap-4 text-xs font-semibold text-gray-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-cyan-500" />Income</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-400" />Expenses</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-indigo-400" />Payroll</span>
      </div>
      <div className="flex items-end gap-3" style={{ height: '140px' }}>
        {months.map(m => {
          const payroll = m.payroll ?? 0
          const incomePct = (m.income / maxVal) * 100
          const expensesPct = (m.expenses / maxVal) * 100
          const payrollPct = (payroll / maxVal) * 100
          return (
            <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full items-end gap-0.5 rounded-xl bg-gray-50 dark:bg-slate-800" style={{ height: '100px' }}>
                <div
                  className="flex-1 rounded-l-xl bg-cyan-500 transition-all"
                  style={{ height: `${m.income > 0 ? Math.max(incomePct, 4) : 0}%` }}
                />
                <div
                  className="flex-1 bg-rose-400 transition-all"
                  style={{ height: `${m.expenses > 0 ? Math.max(expensesPct, 4) : 0}%` }}
                />
                <div
                  className="flex-1 rounded-r-xl bg-indigo-400 transition-all"
                  style={{ height: `${payroll > 0 ? Math.max(payrollPct, 4) : 0}%` }}
                />
              </div>
              <span className="text-xs font-bold text-gray-400 dark:text-slate-500">{m.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build** — `pnpm build` → succeeds (existing `getMonthlyData` still returns `MonthBar` without `payroll`; valid because it's optional).

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/FinanceChart.tsx
git commit -m "feat(finance): add payroll series to monthly P&L chart"
```

---

### Task 2: `CompanyPnLSummary` card

**Files:**
- Create: `src/components/finance/CompanyPnLSummary.tsx`

Context: presentational. Net = revenue − expenses − payroll; green when ≥ 0, red when < 0.

- [ ] **Step 1: Create the component**

```tsx
function formatAUD(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
}

export default function CompanyPnLSummary({
  revenue,
  expenses,
  payroll,
}: {
  revenue: number
  expenses: number
  payroll: number
}) {
  const net = revenue - expenses - payroll
  const profit = net >= 0

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Net profit</h3>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-600 dark:text-slate-300">Revenue</dt>
          <dd className="font-semibold text-slate-900 dark:text-slate-100">{formatAUD(revenue)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-600 dark:text-slate-300">Expenses</dt>
          <dd className="font-semibold text-rose-600 dark:text-rose-400">− {formatAUD(expenses)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-600 dark:text-slate-300">Payroll (gross + super)</dt>
          <dd className="font-semibold text-indigo-600 dark:text-indigo-400">− {formatAUD(payroll)}</dd>
        </div>
        <div className="flex justify-between border-t border-gray-200 pt-2 dark:border-slate-700">
          <dt className="font-bold text-slate-900 dark:text-slate-100">Net profit</dt>
          <dd className={`font-extrabold ${profit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {formatAUD(net)}
          </dd>
        </div>
      </dl>
    </div>
  )
}
```

- [ ] **Step 2: Verify build** — `pnpm build` → succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/CompanyPnLSummary.tsx
git commit -m "feat(finance): CompanyPnLSummary card (revenue − expenses − payroll = net)"
```

---

### Task 3: Wire payroll + P&L into `CompanyFinanceView`

**Files:**
- Modify: `src/components/finance/CompanyFinanceView.tsx`

Context: add the `CompanyPnLSummary` import, a `PayStatementRow` type, extend `getMonthlyData` to bucket payroll, fetch flat org `pay_statements`, compute `periodPayroll`, and replace the "Net profit" placeholder. Payroll fetch is org-scope only; user scope gets an empty array (zero payroll bars, no P&L card).

- [ ] **Step 1: Add the import**

Add to the import block at the top:

```tsx
import CompanyPnLSummary from '@/components/finance/CompanyPnLSummary'
```

- [ ] **Step 2: Add the `PayStatementRow` type**

After the `ExpenseEntry` type declaration, add:

```tsx
type PayStatementRow = {
  period_start: string
  gross: number
  super_amount: number
}
```

- [ ] **Step 3: Replace `getMonthlyData` to bucket payroll**

Replace the entire existing `getMonthlyData` function with:

```tsx
function getMonthlyData(
  incomeEntries: Pick<IncomeEntry, 'amount' | 'date'>[],
  expenses: ExpenseEntry[],
  payStatements: PayStatementRow[],
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

    const payroll = payStatements
      .filter(s => {
        const date = new Date(s.period_start)
        return date.getFullYear() === year && date.getMonth() === month
      })
      .reduce((sum, s) => sum + Number(s.gross) + Number(s.super_amount), 0)

    months.push({ label, income, expenses: expenseTotal, payroll })
  }

  return months
}
```

- [ ] **Step 4: Replace the data-computation block**

Replace this existing block (the `monthlyData` line through the org payroll fetch):

```tsx
  const monthlyData = getMonthlyData(allIncomeResult.data ?? [], allExpenseResult.data ?? [])
  // Payroll section data — org scope only.
  type PayRun = {
    id: string
    period_start: string
    period_end: string
    created_at: string
    pay_statements: PayStatement[]
  }
  let payRuns: PayRun[] = []
  let payCadence = 'fortnightly'
  if (scope.type === 'org') {
    const [{ data: runs }, { data: orgRow }] = await Promise.all([
      supabase
        .from('pay_runs')
        .select('id, period_start, period_end, created_at, pay_statements(id, period_start, period_end, approved_seconds, hourly_rate, gross, super_rate, super_amount, notes)')
        .eq('org_id', scope.orgId)
        .order('period_start', { ascending: false })
        .limit(6),
      supabase.from('organisations').select('pay_cadence').eq('id', scope.orgId).single(),
    ])
    payRuns = (runs ?? []) as unknown as PayRun[]
    payCadence = (orgRow?.pay_cadence as string) ?? 'fortnightly'
  }
```

with:

```tsx
  // Payroll section data — org scope only.
  type PayRun = {
    id: string
    period_start: string
    period_end: string
    created_at: string
    pay_statements: PayStatement[]
  }
  let payRuns: PayRun[] = []
  let payCadence = 'fortnightly'
  let payStatements: PayStatementRow[] = []
  if (scope.type === 'org') {
    const [{ data: runs }, { data: orgRow }, { data: stmts }] = await Promise.all([
      supabase
        .from('pay_runs')
        .select('id, period_start, period_end, created_at, pay_statements(id, period_start, period_end, approved_seconds, hourly_rate, gross, super_rate, super_amount, notes)')
        .eq('org_id', scope.orgId)
        .order('period_start', { ascending: false })
        .limit(6),
      supabase.from('organisations').select('pay_cadence').eq('id', scope.orgId).single(),
      supabase.from('pay_statements').select('period_start, gross, super_amount').eq('org_id', scope.orgId),
    ])
    payRuns = (runs ?? []) as unknown as PayRun[]
    payCadence = (orgRow?.pay_cadence as string) ?? 'fortnightly'
    payStatements = (stmts ?? []) as PayStatementRow[]
  }

  // Period-filtered payroll cost (gross + super) for the P&L summary.
  // period_start and from/to are all 'YYYY-MM-DD' strings → lexical compare is correct.
  const periodPayroll = payStatements
    .filter(s => (!from || s.period_start >= from) && (!to || s.period_start <= to))
    .reduce((sum, s) => sum + Number(s.gross) + Number(s.super_amount), 0)

  const monthlyData = getMonthlyData(allIncomeResult.data ?? [], allExpenseResult.data ?? [], payStatements)
```

- [ ] **Step 5: Replace the "Net profit" placeholder**

Replace this existing block:

```tsx
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Net profit</h3>
              <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-slate-400">
                Revenue − expenses − payroll roll-up arrives with the company P&amp;L module.
              </p>
            </div>
```

with:

```tsx
            <CompanyPnLSummary revenue={totalIncome} expenses={totalExpenses} payroll={periodPayroll} />
```

- [ ] **Step 6: Verify build + lint** — `pnpm build` and `pnpm lint` → succeed (no new issues in this file).

- [ ] **Step 7: Commit**

```bash
git add src/components/finance/CompanyFinanceView.tsx
git commit -m "feat(finance): company net-profit summary + payroll in trend chart"
```

---

### Task 4: Final verification + docs

**Files:**
- Create: `docs/superpowers/specs/2026-06-07-subsystem3-pnl-design.md` (from staging)
- Create: `docs/superpowers/plans/2026-06-07-subsystem3-pnl.md` (from staging, this file)

- [ ] **Step 1: Full build** — `pnpm build` → succeeds; `/dashboard/finance` in the route table.

- [ ] **Step 2: Manual smoke (owner)**

As an owner of an org with at least one pay run: open `/dashboard/finance` → the Payroll section shows a **Net profit** card (Revenue − Expenses − Payroll), and the Monthly P&L chart shows a third (indigo) payroll bar. Change period tabs → revenue/expenses/payroll totals and net update. Confirm a manager/employee still cannot reach this view.

- [ ] **Step 3: Copy staged docs + commit**

```bash
git add docs/superpowers/specs/2026-06-07-subsystem3-pnl-design.md docs/superpowers/plans/2026-06-07-subsystem3-pnl.md
git commit -m "docs(finance): subsystem 3 P&L design spec + implementation plan"
```

---

## Self-Review

**1. Spec coverage:**
- Net = revenue − expenses − (gross+super) → Task 2 card + Task 3 `periodPayroll`. ✓
- Payroll cost = gross + super_amount → Tasks 2/3 reduce. ✓
- Period tabs reused; payroll by `period_start` → Task 3 `periodPayroll` filter + `getMonthlyData`. ✓
- Summary card (profit green / loss red) → Task 2. ✓
- Payroll in 6-month chart → Tasks 1 + 3. ✓
- Owner/admin only; org scope only → Task 3 `scope.type === 'org'` guards; no new RLS. ✓
- No migration → confirmed (no schema task). ✓

**2. Placeholder scan:** None. Error/empty paths covered (zero payroll → net = revenue − expenses; loss → red; user scope → no card).

**3. Type consistency:** `MonthBar.payroll` optional (Task 1) and supplied by the extended `getMonthlyData` (Task 3). `PayStatementRow` defined once (Task 3 Step 2) and used in `getMonthlyData` + the fetch. `CompanyPnLSummary` props `{revenue, expenses, payroll}` (Task 2) match the call site (Task 3 Step 5). `from`/`to` come from the existing `getPeriodRange(period)` already in the file.

---

## Notes for the executor
- **Final subsystem** of the finance system. After this, S1+S2+S3 together deliver: role-gated visibility, informational payroll, and the company P&L.
- No database changes — do not create a migration.
- Tasks modify S1/S2 files; if line context drifted, locate the "Net profit" placeholder by its "arrives with the company P&L module" text and `getMonthlyData` by name.
