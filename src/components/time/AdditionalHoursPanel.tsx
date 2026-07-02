'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type Project = { id: string; name: string }
type Entry = {
  id: string
  started_at: string
  ended_at: string
  duration_seconds: number | null
  description: string | null
  projects: { name: string } | null
}

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
}
function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export default function AdditionalHoursPanel() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [weekEntries, setWeekEntries] = useState<Entry[]>([])
  const [projectId, setProjectId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const weekStart = new Date()
      const dow = weekStart.getDay()
      weekStart.setDate(weekStart.getDate() - (dow === 0 ? 6 : dow - 1))
      weekStart.setHours(0, 0, 0, 0)

      supabase
        .from('projects')
        .select('id, name')
        .eq('status', 'active')
        .order('name')
        .then(({ data }) => setProjects(data ?? []))

      supabase
        .from('time_entries')
        .select('id, started_at, ended_at, duration_seconds, description, projects(name)')
        .eq('user_id', user.id)
        .gte('started_at', weekStart.toISOString())
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: false })
        .then(({ data }) => setWeekEntries((data ?? []) as unknown as Entry[]))
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!startTime || !endTime) { setError('Please enter start and end times.'); return }

    const startedAt = new Date(`${date}T${startTime}`)
    const endedAt = new Date(`${date}T${endTime}`)
    if (endedAt <= startedAt) { setError('End time must be after start time.'); return }

    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const { data: newEntry, error: insertError } = await supabase
      .from('time_entries')
      .insert({
        user_id: user.id,
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        project_id: projectId || null,
        billable: true,
        description: description.trim() || null,
      })
      .select('id, started_at, ended_at, duration_seconds, description, projects(name)')
      .single()

    setSaving(false)
    if (insertError) { setError(insertError.message); return }

    setWeekEntries(prev => [newEntry as unknown as Entry, ...prev])
    setStartTime('')
    setEndTime('')
    setDescription('')
    router.refresh()
  }

  async function deleteEntry(id: string) {
    const supabase = createClient()
    await supabase.from('time_entries').delete().eq('id', id)
    setWeekEntries(prev => prev.filter(e => e.id !== id))
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Log additional hours</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
              Project (optional)
            </label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="">— Select project —</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Date</label>
              <input
                type="date"
                value={date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={e => setDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">From</label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">To</label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What did you work on?"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Logging…' : 'Log hours'}
          </button>
        </form>
      </div>

      {weekEntries.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3">Additional hours this week</p>
          <div className="space-y-2">
            {weekEntries.map(e => {
              const proj = (e.projects as unknown as { name: string } | null)?.name
              return (
                <div key={e.id} className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{proj ?? '—'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {fmt(e.started_at)}–{fmt(e.ended_at)}
                      {e.duration_seconds ? ` · ${fmtDuration(e.duration_seconds)}` : ''}
                      {e.description ? ` · ${e.description}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteEntry(e.id)}
                    className="ml-3 shrink-0 text-xs text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
