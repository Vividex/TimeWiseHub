'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type OpenTask = { id: string; title: string }
type TimeSettings = { hourlyRate: number | null; roundingMinutes: number }
type TimeEntry = {
  id: string
  description: string | null
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  task_id: string | null
  tasks: { title: string } | null
}

function roundedEndTime(start: Date, end: Date, roundingMinutes: number) {
  if (roundingMinutes !== 15) return end

  const durationMinutes = (end.getTime() - start.getTime()) / 60000
  const roundedMinutes = Math.max(roundingMinutes, Math.round(durationMinutes / roundingMinutes) * roundingMinutes)
  return new Date(start.getTime() + roundedMinutes * 60000)
}

export default function ManualEntryForm({ onAdd }: { onAdd?: (entry: TimeEntry) => void }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [description, setDescription] = useState('')
  const [taskId, setTaskId] = useState('')
  const [openTasks, setOpenTasks] = useState<OpenTask[]>([])
  const [timeSettings, setTimeSettings] = useState<TimeSettings>({ hourlyRate: null, roundingMinutes: 0 })
  const [billable, setBillable] = useState(true)
  const [billableRate, setBillableRate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('tasks')
        .select('id, title')
        .eq('assignee_id', user.id)
        .neq('status', 'done')
        .order('due_date', { ascending: true, nullsFirst: false })
        .then(({ data }) => setOpenTasks(data ?? []))

      supabase
        .from('organisation_members')
        .select('hourly_rate, organisations(time_rounding_minutes)')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          const organisation = data?.organisations as unknown as { time_rounding_minutes: number } | null
          const hourlyRate = data?.hourly_rate ?? null
          setTimeSettings({
            hourlyRate,
            roundingMinutes: organisation?.time_rounding_minutes ?? 0,
          })
          if (hourlyRate !== null) setBillableRate(String(hourlyRate))
        })
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const startedAt = new Date(`${date}T${startTime}`)
    const rawEndedAt = new Date(`${date}T${endTime}`)

    if (rawEndedAt <= startedAt) {
      setError('End time must be after start time.')
      setLoading(false)
      return
    }

    const endedAt = roundedEndTime(startedAt, rawEndedAt, timeSettings.roundingMinutes)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: newEntry, error } = await supabase.from('time_entries').insert({
      user_id: user.id,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      description: description || null,
      task_id: taskId || null,
      billable,
      billable_rate: billableRate ? Number(billableRate) : null,
    }).select('id, description, started_at, ended_at, duration_seconds, task_id, tasks(title)').single()

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setStartTime('')
    setEndTime('')
    setDescription('')
    setTaskId('')
    setBillableRate(timeSettings.hourlyRate?.toString() ?? '')
    setBillable(true)
    setOpen(false)
    setLoading(false)
    if (newEntry) onAdd?.(newEntry as unknown as TimeEntry)
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600"
      >
        {open ? 'Cancel manual entry' : '+ Add manual entry'}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Date</label>
              <input type="date" required value={date} onChange={e => setDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Start</label>
              <input type="time" required value={startTime} onChange={e => setStartTime(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">End</label>
              <input type="time" required value={endTime} onChange={e => setEndTime(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Description</label>
            <input type="text" placeholder="What did you work on?" value={description} onChange={e => setDescription(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>

          {openTasks.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Link to task (optional)</label>
              <select value={taskId} onChange={e => setTaskId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                <option value="">— No task —</option>
                {openTasks.map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={billable} onChange={e => setBillable(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-cyan-500" />
              <span className="text-sm font-semibold text-gray-700">Billable</span>
            </label>
            {billable && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-500">Rate (optional)</label>
                <input type="number" min="0" step="0.01" value={billableRate} onChange={e => setBillableRate(e.target.value)}
                  placeholder="$/hr"
                  className="w-24 rounded-xl border border-gray-200 px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
              </div>
            )}
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <button type="submit" disabled={loading}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
            {loading ? 'Saving...' : 'Save entry'}
          </button>
        </form>
      )}
    </div>
  )
}
