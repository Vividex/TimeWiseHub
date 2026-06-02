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
    <div className="bg-white rounded-2xl shadow p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">New event</h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-700 text-sm">✕</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
          <input type="text" required value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Event title"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input type="date" required value={date} onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} className="rounded" />
              All day
            </label>
          </div>
        </div>

        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">End</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>

        {orgId && (
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} className="rounded" />
            Share with organisation
          </label>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button type="submit" disabled={loading}
            className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Saving...' : 'Save event'}
          </button>
          <button type="button" onClick={onCancel}
            className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
