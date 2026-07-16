'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type BillableSession = {
  id: string
  title: string
  scheduled_at: string
  duration_minutes: number
  studentName: string | null
  subjectLabel: string
}

export default function BillableSessionsPanel({
  clientId,
  orgId,
  defaultRate,
  currency,
  sessions,
}: {
  clientId: string
  orgId: string | null
  defaultRate: number
  currency: string
  sessions: BillableSession[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (sessions.length === 0) return null

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedSessions = sessions.filter(s => selected.has(s.id))
  const subtotal = selectedSessions.reduce((sum, s) => sum + defaultRate * (s.duration_minutes / 60), 0)

  async function handleSubmit() {
    if (selectedSessions.length === 0) return
    setSubmitting(true)
    setError(null)

    const items = selectedSessions.map(s => ({
      description: `${s.title} — ${new Date(s.scheduled_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`,
      quantity: s.duration_minutes / 60,
      unit_price: defaultRate,
      session_id: s.id,
    }))

    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        orgId,
        currency,
        issueDate: new Date().toISOString().slice(0, 10),
        items,
      }),
    })

    const result = await res.json()
    if (!res.ok) {
      setError(result.error ?? 'Failed to create invoice')
      setSubmitting(false)
      return
    }
    router.push(`/dashboard/invoices/${result.id}`)
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-500">Billable lessons</h2>
      <ul className="divide-y divide-gray-50 dark:divide-slate-800">
        {sessions.map(s => (
          <li key={s.id} className="flex items-center gap-3 py-3">
            <input
              type="checkbox"
              checked={selected.has(s.id)}
              onChange={() => toggle(s.id)}
              className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-400"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                {s.title}{s.studentName ? ` · ${s.studentName}` : ''}{s.subjectLabel ? ` · ${s.subjectLabel}` : ''}
              </p>
              <p className="text-xs text-gray-400">
                {new Date(s.scheduled_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} · {s.duration_minutes} min
              </p>
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
              {currency} {(defaultRate * (s.duration_minutes / 60)).toFixed(2)}
            </p>
          </li>
        ))}
      </ul>

      {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 dark:border-slate-800">
        <p className="text-sm font-bold text-gray-900 dark:text-slate-100">
          Subtotal: {currency} {subtotal.toFixed(2)}
        </p>
        <button
          onClick={handleSubmit}
          disabled={selected.size === 0 || submitting}
          className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {submitting ? 'Creating…' : `Create invoice (${selected.size})`}
        </button>
      </div>
    </div>
  )
}
