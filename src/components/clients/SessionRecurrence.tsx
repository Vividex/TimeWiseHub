'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Repeat as RepeatIcon, X } from 'lucide-react'
import type { SessionSeriesInfo, SessionSeriesInterval } from '@/lib/sessions/series'

const INTERVAL_LABEL: Record<SessionSeriesInterval, string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
}

export default function SessionRecurrence({
  sessionId,
  clientId,
  series,
}: {
  sessionId: string
  clientId: string
  series: SessionSeriesInfo | null
}) {
  const router = useRouter()
  const [showPicker, setShowPicker] = useState(false)
  const [selectedInterval, setSelectedInterval] = useState<SessionSeriesInterval>('weekly')
  const [saving, setSaving] = useState(false)
  const [stopping, setStopping] = useState(false)

  async function makeRecurring() {
    setSaving(true)
    const res = await fetch(`/api/sessions/${sessionId}/series`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recurrenceInterval: selectedInterval }),
    })
    setSaving(false)
    if (!res.ok) return
    setShowPicker(false)
    router.refresh()
  }

  async function stopRecurring() {
    if (!series) return
    setStopping(true)
    await fetch(`/api/sessions/series/${series.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepSessionId: sessionId }),
    })
    setStopping(false)
    router.push(`/dashboard/clients/${clientId}/sessions`)
  }

  if (series?.is_active) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 dark:border-slate-700 dark:text-slate-300">
          <RepeatIcon size={12} />
          Recurring: {INTERVAL_LABEL[series.recurrence_interval]}
        </span>
        <button
          type="button"
          onClick={stopRecurring}
          disabled={stopping}
          className="text-xs font-semibold text-red-500 hover:underline disabled:opacity-50"
        >
          {stopping ? 'Stopping…' : 'Stop recurring'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setShowPicker(true)}
        className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 shadow-sm hover:bg-gray-50 hover:border-gray-300 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:border-slate-600"
      >
        <RepeatIcon size={12} />
        Make recurring
      </button>

      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Make recurring</h2>
              <button
                type="button"
                onClick={() => setShowPicker(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:text-slate-500 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Repeat</label>
            <select
              value={selectedInterval}
              onChange={e => setSelectedInterval(e.target.value as SessionSeriesInterval)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
            </select>
            <p className="mt-2 text-xs text-gray-400 dark:text-slate-500">
              Generates 7 upcoming occurrences on top of this session, kept topped up automatically.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowPicker(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 dark:border-slate-700 dark:text-slate-300">
                Cancel
              </button>
              <button
                type="button"
                onClick={makeRecurring}
                disabled={saving}
                className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Make recurring'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
