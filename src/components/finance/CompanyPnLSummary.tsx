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
