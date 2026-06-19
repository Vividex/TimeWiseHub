type Props = {
  totalIncome: number
  totalExpenses: number
  currency: string
}

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n)
}

export default function FinanceSummary({ totalIncome, totalExpenses, currency }: Props) {
  const net = totalIncome - totalExpenses
  const netPositive = net >= 0

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Total Income</p>
        <p className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">{fmt(totalIncome, currency)}</p>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Total Expenses</p>
        <p className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">{fmt(totalExpenses, currency)}</p>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Profit</p>
        <p className={`mt-2 text-2xl font-black tracking-tight ${netPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {netPositive ? '+' : ''}{fmt(net, currency)}
        </p>
      </div>
    </div>
  )
}
