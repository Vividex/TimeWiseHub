import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import FinanceSummary from '@/components/finance/FinanceSummary'
import FinanceChart, { type MonthBar } from '@/components/finance/FinanceChart'
import ExpensePieChart, { type CategorySlice } from '@/components/finance/ExpensePieChart'
import IncomeForm from '@/components/finance/IncomeForm'
import IncomeList from '@/components/finance/IncomeList'
import RunPayControl from '@/components/finance/RunPayControl'
import PayStatementCard, { type PayStatement } from '@/components/finance/PayStatementCard'
import CompanyPnLSummary from '@/components/finance/CompanyPnLSummary'
import PayslipUpload, { type OrgMemberOption } from '@/components/finance/PayslipUpload'
import PayslipList, { type PayslipRow } from '@/components/finance/PayslipList'
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
  category_id: string | null
  description: string | null
}

type PayStatementRow = {
  period_start: string
  gross: number
  super_amount: number
}

function getMonthlyData(
  incomeEntries: Pick<IncomeEntry, 'amount' | 'date'>[],
  expenses: Pick<ExpenseEntry, 'amount' | 'expense_date'>[],
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

    const totalExpenses = expenseTotal + payroll
    months.push({ label, income, totalExpenses, profit: income - totalExpenses })
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
    .select('amount, expense_date, category_id, description')
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

  const [incomeResult, expenseResult, allIncomeResult, allExpenseResult, categoriesResult] = await Promise.all([
    incomeQuery,
    expenseQuery,
    supabase.from('income_entries').select('amount, date').eq(scopeColumn, scopeValue),
    supabase.from('expenses').select('amount, expense_date').eq(scopeColumn, scopeValue),
    supabase.from('expense_categories').select('id, name'),
  ])

  const incomeEntries = (incomeResult.data ?? []) as IncomeEntry[]
  const expenses = (expenseResult.data ?? []) as unknown as ExpenseEntry[]
  const totalIncome = incomeEntries.reduce((sum, entry) => sum + Number(entry.amount), 0)
  const totalExpenses = expenses.reduce((sum, entry) => sum + Number(entry.amount), 0)
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
  let payslipRows: PayslipRow[] = []
  let payslipMembers: OrgMemberOption[] = []
  if (scope.type === 'org') {
    const [{ data: runs }, { data: orgRow }, { data: stmts }, { data: payslipsData }, { data: membersForPayslips }] = await Promise.all([
      supabase
        .from('pay_runs')
        .select('id, period_start, period_end, created_at, pay_statements(id, period_start, period_end, approved_seconds, hourly_rate, gross, super_rate, super_amount, notes)')
        .eq('org_id', scope.orgId)
        .order('period_start', { ascending: false })
        .limit(6),
      supabase.from('organisations').select('pay_cadence').eq('id', scope.orgId).single(),
      supabase.from('pay_statements').select('period_start, gross, super_amount').eq('org_id', scope.orgId),
      supabase
        .from('payslips')
        .select('id, label, pay_date, file_path, uploaded_at, user_id, profiles!payslips_user_id_fkey(full_name, email)')
        .eq('org_id', scope.orgId)
        .order('pay_date', { ascending: false }),
      supabase
        .from('organisation_members')
        .select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)')
        .eq('org_id', scope.orgId),
    ])
    payRuns = (runs ?? []) as unknown as PayRun[]
    payCadence = (orgRow?.pay_cadence as string) ?? 'fortnightly'
    payStatements = (stmts ?? []) as PayStatementRow[]
    payslipRows = ((payslipsData ?? []) as unknown as {
      id: string; label: string; pay_date: string; file_path: string; uploaded_at: string
      profiles: { full_name: string | null; email: string } | null
    }[]).map(p => ({
      id: p.id, label: p.label, pay_date: p.pay_date, file_path: p.file_path, uploaded_at: p.uploaded_at,
      employeeName: p.profiles?.full_name || p.profiles?.email || 'Unknown',
    }))
    payslipMembers = ((membersForPayslips ?? []) as unknown as {
      user_id: string; profiles: { full_name: string | null; email: string } | null
    }[]).map(m => ({ user_id: m.user_id, name: m.profiles?.full_name || m.profiles?.email || 'Unknown' }))
  }

  // Period-filtered payroll cost (gross + super) for the P&L summary.
  // period_start and from/to are all 'YYYY-MM-DD' strings → lexical compare is correct.
  const periodPayroll = payStatements
    .filter(s => (!from || s.period_start >= from) && (!to || s.period_start <= to))
    .reduce((sum, s) => sum + Number(s.gross) + Number(s.super_amount), 0)

  const allExpenses = (allExpenseResult.data ?? []) as { amount: number; expense_date: string }[]
  const monthlyData = getMonthlyData(allIncomeResult.data ?? [], allExpenses, payStatements)

  // Build category lookup from the separate categories fetch (avoids PostgREST join issues)
  const categoryLookup = new Map<string, string>()
  for (const cat of (categoriesResult.data ?? []) as { id: string; name: string }[]) {
    categoryLookup.set(cat.id, cat.name)
  }

  // Keyword-based fallback for expenses with no category_id
  function guessCategory(desc: string): string {
    const d = desc.toLowerCase()
    if (/software|subscription|saas|plugin|tool|license|licence|domain|hosting/.test(d)) return 'Software'
    if (/office|stationery|supplies|paper|printer/.test(d)) return 'Office Supplies'
    if (/travel|flight|transport|taxi|uber|fuel|petrol|toll/.test(d)) return 'Travel'
    if (/meal|food|lunch|dinner|breakfast|coffee|cafe|restaurant/.test(d)) return 'Meals'
    if (/hotel|accommodation|airbnb|motel/.test(d)) return 'Accommodation'
    if (/marketing|advertising|\bads\b|campaign|seo/.test(d)) return 'Marketing'
    if (/equipment|hardware|computer|phone|device/.test(d)) return 'Equipment'
    return 'Other'
  }

  // Expense breakdown by category (period-filtered)
  const categoryMap = new Map<string, number>()
  for (const exp of expenses) {
    const name = exp.category_id
      ? (categoryLookup.get(exp.category_id) ?? 'Other')
      : guessCategory(exp.description ?? '')
    categoryMap.set(name, (categoryMap.get(name) ?? 0) + Number(exp.amount))
  }
  const categorySlices: CategorySlice[] = [...categoryMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }))

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

        <FinanceSummary totalIncome={totalIncome} totalExpenses={totalExpenses + (scope.type === 'org' ? periodPayroll : 0)} currency="AUD" />
        <FinanceChart months={monthlyData} />
        {categorySlices.length > 0 && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ExpensePieChart data={[
              ...categorySlices,
              ...(scope.type === 'org' && periodPayroll > 0 ? [{ name: 'Payroll', value: periodPayroll }] : []),
            ]} />
          </div>
        )}

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

            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Payslips</h3>
              <PayslipUpload orgId={scope.orgId} uploadedBy={currentUserId} members={payslipMembers} />
              <PayslipList payslips={payslipRows} canDelete />
            </div>

            <CompanyPnLSummary revenue={totalIncome} expenses={totalExpenses} payroll={periodPayroll} />
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
