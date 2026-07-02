'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type Entry = { id: string; started_at: string; ended_at: string | null; description: string | null; task_id: string | null; project_id: string | null }
type OpenProject = { id: string; name: string }
type TimeSettings = { hourlyRate: number | null; roundingMinutes: number }
type CompletedEntry = {
  id: string
  description: string | null
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  task_id: string | null
  project_id: string | null
  tasks: { title: string } | null
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(startIso: string) {
  const mins = Math.floor((Date.now() - new Date(startIso).getTime()) / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function roundedEndTime(startIso: string, end: Date, roundingMinutes: number) {
  if (roundingMinutes !== 15) return end.toISOString()

  const start = new Date(startIso)
  const durationMinutes = (end.getTime() - start.getTime()) / 60000
  const roundedMinutes = Math.max(roundingMinutes, Math.round(durationMinutes / roundingMinutes) * roundingMinutes)
  return new Date(start.getTime() + roundedMinutes * 60000).toISOString()
}

export default function TimerWidget({ activeEntry, onEntryCompleted }: { activeEntry: Entry | null; onEntryCompleted?: (entry: CompletedEntry) => void }) {
  const router = useRouter()
  const [running, setRunning] = useState(!!activeEntry)
  const [entryId, setEntryId] = useState(activeEntry?.id ?? null)
  const [startedAt, setStartedAt] = useState(activeEntry?.started_at ?? null)
  const [description, setDescription] = useState(activeEntry?.description ?? '')
  const [projectId, setProjectId] = useState(activeEntry?.project_id ?? '')
  const [openProjects, setOpenProjects] = useState<OpenProject[]>([])
  const [timeSettings, setTimeSettings] = useState<TimeSettings>({ hourlyRate: null, roundingMinutes: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('projects').select('id, name')
        .eq('status', 'active')
        .order('name')
        .then(({ data }) => setOpenProjects(data ?? []))

      supabase
        .from('organisation_members')
        .select('hourly_rate, organisations(time_rounding_minutes)')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          const organisation = data?.organisations as unknown as { time_rounding_minutes: number } | null
          setTimeSettings({
            hourlyRate: data?.hourly_rate ?? null,
            roundingMinutes: organisation?.time_rounding_minutes ?? 0,
          })
        })
    })
  }, [])

  // Refresh duration display every minute while clocked in
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [running])

  async function handleClockIn() {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const now = new Date().toISOString()
    const { data, error: insertError } = await supabase
      .from('time_entries')
      .insert({
        user_id: user.id,
        started_at: now,
        description: description || null,
        task_id: null,
        project_id: projectId || null,
        billable: true,
        billable_rate: timeSettings.hourlyRate,
      })
      .select().single()

    if (insertError) {
      setError(insertError.message)
    } else if (data) {
      setEntryId(data.id)
      setStartedAt(data.started_at)
      setRunning(true)
    }
    setLoading(false)
  }

  async function handleClockOut() {
    if (!entryId) return
    setLoading(true)
    const supabase = createClient()
    const endedAt = startedAt ? roundedEndTime(startedAt, new Date(), timeSettings.roundingMinutes) : new Date().toISOString()
    await supabase.from('time_entries')
      .update({ ended_at: endedAt, description: description || null })
      .eq('id', entryId)

    const { data: completed } = await supabase
      .from('time_entries')
      .select('id, description, started_at, ended_at, duration_seconds, task_id, tasks(title)')
      .eq('id', entryId)
      .single()

    setRunning(false)
    setEntryId(null)
    setStartedAt(null)
    setDescription('')
    setProjectId('')
    setLoading(false)
    if (completed) onEntryCompleted?.(completed as unknown as CompletedEntry)
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="mb-5 text-xl font-bold text-gray-900">
        {running ? 'Currently clocked in' : 'Clock in'}
      </h2>

      {running && startedAt ? (
        <div className="space-y-4">
          <div className="rounded-2xl bg-cyan-50 border border-cyan-100 px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-600">Started</p>
            <p className="mt-1 text-3xl font-black tracking-tight text-slate-900">{fmtTime(startedAt)}</p>
            <p className="mt-0.5 text-sm font-semibold text-cyan-700">{fmtDuration(startedAt)} ago</p>
          </div>

          {description && (
            <p className="text-sm font-semibold text-gray-500">{description}</p>
          )}

          <button onClick={handleClockOut} disabled={loading}
            className="w-full rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-700 disabled:opacity-50">
            {loading ? 'Clocking out…' : 'Clock Out'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">What are you working on? (optional)</label>
            <input type="text" placeholder="e.g. Client meetings, invoicing…"
              value={description} onChange={e => setDescription(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>

          {openProjects.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Link to project (optional)</label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                <option value="">— No project —</option>
                {openProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <button onClick={handleClockIn} disabled={loading}
            className="w-full rounded-xl bg-cyan-500 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
            {loading ? 'Clocking in…' : 'Clock In'}
          </button>
        </div>
      )}
    </div>
  )
}
