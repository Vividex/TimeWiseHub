'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type Entry = { id: string; started_at: string; ended_at: string | null; description: string | null }

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
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
      .insert({ user_id: user.id, started_at: now, description: description || null })
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
    setLoading(false)
    router.refresh()
  }

  async function handlePause() {
    await handleStop()
  }

  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Timer</h2>

      <div className="text-5xl font-mono font-bold text-gray-900 mb-6 tabular-nums">
        {formatElapsed(elapsed)}
      </div>

      <input
        type="text"
        placeholder="What are you working on?"
        value={description}
        onChange={e => setDescription(e.target.value)}
        disabled={running}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
      />

      <div className="flex gap-2">
        {!running ? (
          <button
            onClick={handleStart}
            disabled={loading}
            className="bg-blue-600 text-white rounded-lg px-6 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Start
          </button>
        ) : (
          <>
            <button
              onClick={handlePause}
              disabled={loading}
              className="bg-yellow-500 text-white rounded-lg px-6 py-2 text-sm font-medium hover:bg-yellow-600 disabled:opacity-50"
            >
              Pause
            </button>
            <button
              onClick={handleStop}
              disabled={loading}
              className="bg-red-500 text-white rounded-lg px-6 py-2 text-sm font-medium hover:bg-red-600 disabled:opacity-50"
            >
              Stop
            </button>
          </>
        )}
      </div>
    </div>
  )
}
