'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RunPayControl({ cadence }: { cadence: string }) {
  const router = useRouter()
  const [anchorDate, setAnchorDate] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true); setMessage(null); setError(null)

    const res = await fetch('/api/pay-runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anchorDate, notes }),
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setError(data?.error ?? 'Pay run failed.')
    } else {
      const skippedNote = data.skipped?.length ? ` (${data.skipped.length} skipped — no rate set)` : ''
      setMessage(`Created ${data.created} statement(s) for ${data.periodStart} – ${data.periodEnd}${skippedNote}.`)
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <form onSubmit={run} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="anchorDate" className="block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">
            Pay period date ({cadence})
          </label>
          <input
            id="anchorDate" type="date" required value={anchorDate}
            onChange={e => setAnchorDate(e.target.value)}
            className="mt-1 rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label htmlFor="payNotes" className="block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">
            Notes / reference (optional)
          </label>
          <input
            id="payNotes" type="text" value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. incl. bonus"
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <button
          type="submit" disabled={loading}
          className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
        >
          {loading ? 'Running…' : 'Run pay'}
        </button>
      </div>
      {message && <p className="rounded-xl bg-green-50 px-3 py-2 text-sm font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-300">{message}</p>}
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
    </form>
  )
}
