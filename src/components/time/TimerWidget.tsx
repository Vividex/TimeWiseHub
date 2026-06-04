'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type Entry = { id: string; started_at: string; ended_at: string | null; description: string | null; task_id: string | null }
type OpenTask = { id: string; title: string }

function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function TimerWidget({ activeEntry }: { activeEntry: Entry | null }) {
  const router = useRouter()
  const [running, setRunning] = useState(!!activeEntry)
  const [elapsed, setElapsed] = useState(0)
  const [description, setDescription] = useState(activeEntry?.description ?? '')
  const [entryId, setEntryId] = useState(activeEntry?.id ?? null)
  const [taskId, setTaskId] = useState(activeEntry?.task_id ?? '')
  const [openTasks, setOpenTasks] = useState<OpenTask[]>([])
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  useEffect(() => {
    if (running && activeEntry) {
      const startedAt = new Date(activeEntry.started_at).getTime()
      const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000))
      tick()
      intervalRef.current = setInterval(tick, 1000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running, activeEntry])

  async function handleStart() {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('time_entries')
      .insert({ user_id: user.id, started_at: now, description: description || null, task_id: taskId || null })
      .select()
      .single()

    if (!error && data) {
      setEntryId(data.id)
      setElapsed(0)
      setRunning(true)
      const startedAt = new Date(data.started_at).getTime()
      intervalRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    }
    setLoading(false)
  }

  async function handleStop() {
    if (!entryId) return
    setLoading(true)
    if (intervalRef.current) clearInterval(intervalRef.current)

    const supabase = createClient()
    await supabase
      .from('time_entries')
      .update({ ended_at: new Date().toISOString(), description: description || null })
      .eq('id', entryId)

    setRunning(false)
    setElapsed(0)
    setEntryId(null)
    setDescription('')
    setTaskId('')
    setLoading(false)
    router.refresh()
  }

  async function handlePause() {
    await handleStop()
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-bold text-gray-900">Timer</h2>

      <div className="mb-6 rounded-2xl bg-gray-50 p-6 text-5xl font-black tabular-nums tracking-tight text-gray-900">
        {formatElapsed(elapsed)}
      </div>

      <input
        type="text"
        placeholder="What are you working on?"
        value={description}
        onChange={e => setDescription(e.target.value)}
        disabled={running}
        className="mb-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:bg-gray-50 disabled:text-gray-500"
      />

      {openTasks.length > 0 && (
        <select
          value={taskId}
          onChange={e => setTaskId(e.target.value)}
          disabled={running}
          className="mb-4 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:bg-gray-50 disabled:text-gray-500"
        >
          <option value="">— Link to task (optional) —</option>
          {openTasks.map(t => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
      )}

      <div className="flex gap-2">
        {!running ? (
          <button
            onClick={handleStart}
            disabled={loading}
            className="rounded-xl bg-cyan-500 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
          >
            Start
          </button>
        ) : (
          <>
            <button
              onClick={handlePause}
              disabled={loading}
              className="rounded-xl bg-amber-500 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              Pause
            </button>
            <button
              onClick={handleStop}
              disabled={loading}
              className="rounded-xl bg-red-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              Stop
            </button>
          </>
        )}
      </div>
    </div>
  )
}

