'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import ConfirmDialog from '@/components/ConfirmDialog'

type IncomeEntry = {
  id: string
  date: string
  amount: number
  currency: string
  category: string
  description: string | null
  source_type: string
}

export default function IncomeList({
  entries,
}: {
  entries: IncomeEntry[]
}) {
  const router = useRouter()
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeletingId(id)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.from('income_entries').delete().eq('id', id)
    setDeletingId(null)
    setConfirmId(null)
    if (err) {
      setError('Failed to delete entry. Please try again.')
      return
    }
    router.refresh()
  }

  if (entries.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-slate-500 py-4 text-center">No income entries for this period.</p>
  }

  return (
    <>
      {error && (
        <p className="mb-3 rounded-xl bg-red-50 dark:bg-red-950 px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-slate-700">
              <th className="pb-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-400">Date</th>
              <th className="pb-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-400">Category</th>
              <th className="pb-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-400">Description</th>
              <th className="pb-2 text-right text-xs font-semibold text-gray-500 dark:text-slate-400">Amount</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id} className="border-b border-gray-50 dark:border-slate-800">
                <td className="py-2 text-gray-600 dark:text-slate-300">{e.date}</td>
                <td className="py-2 text-gray-600 dark:text-slate-300">{e.category}</td>
                <td className="py-2 text-gray-500 dark:text-slate-400 max-w-[200px] truncate">
                  {e.description ?? '—'}
                  {e.source_type === 'invoice' && (
                    <span className="ml-2 rounded-full bg-cyan-100 dark:bg-cyan-900 px-2 py-0.5 text-xs text-cyan-700 dark:text-cyan-300">
                      Invoice
                    </span>
                  )}
                </td>
                <td className="py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                  {e.currency} {Number(e.amount).toFixed(2)}
                </td>
                <td className="py-2 text-right">
                  {e.source_type === 'manual' && (
                    <button
                      onClick={() => setConfirmId(e.id)}
                      disabled={deletingId === e.id}
                      className="rounded-lg px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-40"
                    >
                      {deletingId === e.id ? '…' : 'Delete'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete income entry"
        message="This income entry will be permanently deleted. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => { if (confirmId) handleDelete(confirmId) }}
        onCancel={() => setConfirmId(null)}
      />
    </>
  )
}
