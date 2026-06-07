# Subsystem 3 — Company P&L / Net Profit: Design

> **Staging note:** Authored by Claude. Codex commits to `docs/superpowers/specs/2026-06-07-subsystem3-pnl-design.md` and makes all file changes in `C:/GameForge/timewisehub`. Built on shipped Subsystems 1 & 2. **Final subsystem of the finance system.**

**Goal:** Show owner/admin a company net-profit roll-up — revenue − operating expenses − payroll (gross + super) — for the selected period, plus payroll folded into the existing 6-month trend chart. Owner/admin only.

**Architecture:** Pure aggregation over existing data; **no migration, no new tables, no new RLS.** Extend `MonthBar`/`FinanceChart` with a payroll series, add a presentational `CompanyPnLSummary` card, and wire both into `CompanyFinanceView` (org scope), replacing the "Net profit" placeholder S2 left at lines 194-199.

**Tech Stack:** Next.js 16 (async server components), React 19, Supabase (read-only here), TypeScript, Tailwind v4. pnpm.

---

## Scope

**In scope:** P&L summary card; payroll series in the 6-month chart; wiring into the org-scope company view.

**Out of scope:** any change to how revenue/expenses/payroll are recorded; forecasting, budgets, tax/BAS; multi-currency; exposing P&L to managers/employees (never).

---

## Locked decisions (from requirements)

- `Net profit = revenue − operating expenses − payroll cost`.
- Payroll cost = `gross + super_amount` (full employer cost).
- Reuse existing period tabs (month/quarter/year/all); payroll attributed by `pay_statements.period_start`.
- Presentation: P&L summary card (profit green / loss red) **and** payroll added to the 6-month chart.
- Visibility: owner/admin only — inherited; no new RLS.

---

## Data (no schema change)

All reads use the existing owner/admin RLS:
- Revenue: `income_entries` (period-filtered, already fetched in `CompanyFinanceView`).
- Expenses: `expenses` (period-filtered, already fetched).
- Payroll: **new read** of `pay_statements` (`period_start, gross, super_amount`) for the org — drives both the period summary and the 6-month chart. Owner/admin can read all org statements (S2 RLS `own_or_financial_read`).

Payroll attribution:
- **Summary (period-filtered):** sum `gross + super_amount` over statements whose `period_start` ∈ `[from, to]` (no filter when period = all).
- **Chart (6 months):** bucket `gross + super_amount` by the month of `period_start`.

Solo/user scope has no payroll → payroll series is empty (zeros); the P&L summary card is **org-scope only**.

---

## Components

### `FinanceChart` extension
`MonthBar` gains `payroll: number`. The chart renders a third bar per month (distinct colour, e.g. indigo) alongside income (cyan) and expenses (rose), adds a legend entry, and includes payroll in its `maxVal` scaling. Existing two-bar behaviour is preserved when `payroll` is 0.

### `CompanyPnLSummary` (new, presentational)
Props `{ revenue, expenses, payroll }`. Renders four rows — Revenue, − Expenses, − Payroll, = **Net profit** — with net coloured **green when ≥ 0, red when < 0**. AUD formatting via `Intl.NumberFormat('en-AU', …)`, matching the codebase.

### `CompanyFinanceView` wiring (org scope only)
- Fetch org `pay_statements` (`period_start, gross, super_amount`); `[]` for user scope.
- Compute `periodPayroll` (period-filtered) and pass statements into `getMonthlyData` (extended to accept them) so the chart shows payroll.
- Render `<CompanyPnLSummary revenue={totalIncome} expenses={totalExpenses} payroll={periodPayroll} />` where the "Net profit" placeholder currently sits.

---

## Error handling
- No pay statements: `periodPayroll = 0`; net = revenue − expenses; card renders normally.
- Loss (net < 0): displayed in red — not an error.
- User/solo scope: no P&L card, empty payroll series; no crash.
- RLS denial: empty data → zeros; no crash.

---

## Verification approach
Same as S1/S2 (no test runner):
- **Pure logic:** the extended `getMonthlyData` payroll bucketing and the net calculation verified by reasoned truth table + the build.
- **App code:** `pnpm build` + `pnpm lint`.
- **No RLS work** to verify (read-only on already-verified policies); a manual smoke as owner confirms the card and chart reflect a known pay run.

---

## Files
- Modify: `src/components/finance/FinanceChart.tsx` (`MonthBar` + payroll bar/legend)
- Create: `src/components/finance/CompanyPnLSummary.tsx`
- Modify: `src/components/finance/CompanyFinanceView.tsx` (payroll fetch, `getMonthlyData` extension, replace placeholder)

---

## Resolved facts (verified against shipped code)
1. `MonthBar = { label, income, expenses }`; `FinanceChart` renders income (cyan) + expenses (rose) bars with a legend (`FinanceChart.tsx`).
2. `getMonthlyData(incomeEntries, expenses)` builds the trailing-6-month series (`CompanyFinanceView.tsx:28-59`).
3. The "Net profit" placeholder is `CompanyFinanceView.tsx:194-199`, inside the `scope.type === 'org'` block.
4. `PayStatement` carries `gross`, `super_amount`, `period_start` (`PayStatementCard.tsx`).
5. Owner/admin read all org `pay_statements` via S2's `own_or_financial_read` policy — no new RLS.
