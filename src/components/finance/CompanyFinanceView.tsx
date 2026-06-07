import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import FinanceSummary from '@/components/finance/FinanceSummary'
import FinanceChart, { type MonthBar } from '@/components/finance/FinanceChart'
import IncomeForm from '@/components/finance/IncomeForm'
import IncomeList from '@/components/finance/IncomeList'
import RunPayControl from '@/components/finance/RunPayControl'
import PayStatementCard, { type PayStatement } from '@/components/finance/PayStatementCard'
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

        {scope.type === 'org' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Payroll</h2>
            <RunPayControl cadence={payCadence} />

            {payRuns.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-4 text-sm font-semibold text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                No pay runs yet. Use “Run pay” above to generate statements from approved hours.
              </p>
            ) : (
              payRuns.map(run => {
                const cost = run.pay_statements.reduce((sum, s) => sum + Number(s.gross) + Number(s.super_amount), 0)
                return (
                  <div key={run.id} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100">{run.period_start} – {run.period_end}</span>
                      <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                        {run.pay_statements.length} statement(s) · cost {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cost)}
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {run.pay_statements.map(s => (
                        <PayStatementCard key={s.id} statement={s} showNet={false} />
                      ))}
                    </div>
                  </div>
                )
              })
            )}

            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Net profit</h3>
              <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-slate-400">
                Revenue − expenses − payroll roll-up arrives with the company P&amp;L module.
              </p>
            </div>
          </div>
        )}

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
