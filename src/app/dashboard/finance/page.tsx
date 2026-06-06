import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import FinanceSummary from '@/components/finance/FinanceSummary'
import FinanceChart, { type MonthBar } from '@/components/finance/FinanceChart'
import IncomeForm from '@/components/finance/IncomeForm'
import IncomeList from '@/components/finance/IncomeList'

type Period = 'month' | 'quarter' | 'year' | 'all'

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

const PERIOD_LABELS: Record<Period, string> = {
  month: 'This Month',
  quarter: 'This Quarter',
  year: 'This Year',
  all: 'All Time',
}

function getPeriodRange(period: Period): { from: string | null; to: string | null } {
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

function getMonthlyData(incomeEntries: Pick<IncomeEntry, 'amount' | 'date'>[], expenses: ExpenseEntry[]): MonthBar[] {
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

function isPeriod(value: string | undefined): value is Period {
  return value === 'month' || value === 'quarter' || value === 'year' || value === 'all'
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const params = await searchParams
  const period: Period = isPeriod(params.period) ? params.period : 'month'
  const { from, to } = getPeriodRange(period)

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const orgId = membership?.org_id ?? null

  const incomeQuery = supabase
    .from('income_entries')
    .select('id, amount, currency, category, date, description, source_type')
    .eq('user_id', user.id)
    .order('date', { ascending: false })

  const expenseQuery = supabase
    .from('expenses')
    .select('amount, expense_date')
    .eq('user_id', user.id)
    .order('expense_date', { ascending: false })

  if (from) {
    incomeQuery.gte('date', from)
    expenseQuery.gte('expense_date', from)
  }

  if (to) {
    incomeQuery.lte('date', to)
    expenseQuery.lte('expense_date', to)
  }

  const [incomeResult, expenseResult, allIncomeResult, allExpenseResult] = await Promise.all([
    incomeQuery,
    expenseQuery,
    supabase.from('income_entries').select('amount, date').eq('user_id', user.id),
    supabase.from('expenses').select('amount, expense_date').eq('user_id', user.id),
  ])

  const incomeEntries = (incomeResult.data ?? []) as IncomeEntry[]
  const expenses = (expenseResult.data ?? []) as ExpenseEntry[]
  const totalIncome = incomeEntries.reduce((sum, entry) => sum + Number(entry.amount), 0)
  const totalExpenses = expenses.reduce((sum, entry) => sum + Number(entry.amount), 0)
  const monthlyData = getMonthlyData(allIncomeResult.data ?? [], allExpenseResult.data ?? [])

  return (
    <div className="min-h-full px-4 py-8 sm:px-8 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl space-y-6">
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

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Income</h2>
            <IncomeForm userId={user.id} orgId={orgId} />
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
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                        Date
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                        Amount
                      </th>
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
