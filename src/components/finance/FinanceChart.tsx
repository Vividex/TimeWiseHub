export type MonthBar = {
  label: string
  income: number
  expenses: number
}

export default function FinanceChart({ months }: { months: MonthBar[] }) {
  const maxVal = Math.max(...months.flatMap(m => [m.income, m.expenses]), 1)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Monthly P&amp;L</h3>
      <div className="mb-4 flex items-center gap-4 text-xs font-semibold text-gray-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-cyan-500" />Income</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-400" />Expenses</span>
      </div>
      <div className="flex items-end gap-3" style={{ height: '140px' }}>
        {months.map(m => {
          const incomePct = (m.income / maxVal) * 100
          const expensesPct = (m.expenses / maxVal) * 100
          return (
            <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full items-end gap-0.5 rounded-xl bg-gray-50 dark:bg-slate-800" style={{ height: '100px' }}>
                <div
                  className="flex-1 rounded-l-xl bg-cyan-500 transition-all"
                  style={{ height: `${m.income > 0 ? Math.max(incomePct, 4) : 0}%` }}
                />
                <div
                  className="flex-1 rounded-r-xl bg-rose-400 transition-all"
                  style={{ height: `${m.expenses > 0 ? Math.max(expensesPct, 4) : 0}%` }}
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
