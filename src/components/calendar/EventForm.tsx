'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

type NewEvent = { id: string; title: string; start_at: string; end_at: string | null; all_day: boolean; description: string | null; org_id: string | null; created_by: string }

export default function EventForm({ userId, orgId, initialDate, onSave, onCancel }: {
  userId: string
  orgId: string | null
  initialDate: string
  onSave: (event: NewEvent) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(initialDate)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [allDay, setAllDay] = useState(false)
  const [description, setDescription] = useState('')
  const [shared, setShared] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const startAt = allDay ? `${date}T00:00:00` : `${date}T${startTime}:00`
    const endAt   = allDay ? null : `${date}T${endTime}:00`

    const supabase = createClient()
    const { data, error } = await supabase.from('calendar_events').insert({
      created_by: userId,
      org_id: shared && orgId ? orgId : null,
      title,
      description: description || null,
      start_at: startAt,
      end_at: endAt,
      all_day: allDay,
    }).select().single()

    if (error) { setError(error.message); setLoading(false); return }
    onSave(data as NewEvent)
  }

  return (
    <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-gray-900">New event</h3>
        <button onClick={onCancel} className="rounded-xl bg-gray-50 px-3 py-2 text-sm font-bold text-gray-500 transition-colors hover:text-gray-900">x</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Title</label>
          <input type="text" required value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Event title"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Date</label>
            <input type="date" required value={date} onChange={e => setDate(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-gray-500">
              <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} className="rounded" />
              All day
            </label>
          </div>
        </div>

        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Start</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">End</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Description (optional)</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
            className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {orgId && (
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-gray-500">
            <input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} className="rounded" />
            Share with organisation
          </label>
        )}

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button type="submit" disabled={loading}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Saving...' : 'Save event'}
          </button>
          <button type="button" onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold text-gray-500 transition-colors hover:text-gray-900">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
