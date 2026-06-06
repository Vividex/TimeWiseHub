'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type IncomeEntry = {
  id: string
  amount: number
  currency: string
  category: string
  date: string
  description: string | null
  source_type: string
}

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n)
}

export default function IncomeList({ entries }: { entries: IncomeEntry[] }) {
  const router = useRouter()

  async function handleDelete(id: string) {
    const supabase = createClient()
    await supabase.from('income_entries').delete().eq('id', id)
    router.refresh()
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">No income entries yet. Add one above.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-slate-800">
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Date</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Category</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Description</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Source</th>
              <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Amount</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id} className="border-b border-gray-50 last:border-0 dark:border-slate-800">
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{e.date}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{e.category}</td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{e.description ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                    e.source_type === 'invoice'
                      ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}>
                    {e.source_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                  {fmt(e.amount, e.currency)}
                </td>
                <td className="px-4 py-3 text-right">
                  {e.source_type === 'manual' && (
                    <button
                      onClick={() => handleDelete(e.id)}
                      className="text-xs font-semibold text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
