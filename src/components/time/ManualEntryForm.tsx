'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type OpenTask = { id: string; title: string }

export default function ManualEntryForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [description, setDescription] = useState('')
  const [taskId, setTaskId] = useState('')
  const [openTasks, setOpenTasks] = useState<OpenTask[]>([])
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
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const startedAt = new Date(`${date}T${startTime}`)
    const endedAt = new Date(`${date}T${endTime}`)

    if (endedAt <= startedAt) {
      setError('End time must be after start time.')
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('time_entries').insert({
      user_id: user.id,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      description: description || null,
      task_id: taskId || null,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setStartTime('')
    setEndTime('')
    setDescription('')
    setTaskId('')
    setOpen(false)
    setLoading(false)
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

