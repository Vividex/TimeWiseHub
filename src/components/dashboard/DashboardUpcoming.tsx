'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Calendar, Video, Clock3, CheckSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'

export type UpcomingMeeting = { id: string; title: string; starts_at: string }
export type UpcomingEvent   = { id: string; title: string; start_at: string; end_at: string | null; all_day: boolean }
export type UpcomingSession = { id: string; title: string; scheduled_at: string; client_id: string; client_name: string }
export type UpcomingTask    = { id: string; title: string; due_date: string; project_name: string | null }

function fmtTime(iso: string, allDay: boolean) {
  if (allDay) return 'All day'
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function fmtDueDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' })
}

type TimedItem =
  | { id: string; title: string; time: string; kind: 'meeting' }
  | { id: string; title: string; time: string; kind: 'event'; allDay: boolean }
  | { id: string; title: string; time: string; kind: 'session'; clientId: string }

export default function DashboardUpcoming({
  meetings,
  events,
  sessions,
  tasks,
}: {
  meetings: UpcomingMeeting[]
  events: UpcomingEvent[]
  sessions: UpcomingSession[]
  tasks: UpcomingTask[]
}) {
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())

  const timedItems: TimedItem[] = [
    ...meetings.map(m => ({ id: m.id, title: m.title, time: m.starts_at, kind: 'meeting' as const })),
    ...events.map(e => ({ id: e.id, title: e.title, time: e.start_at, kind: 'event' as const, allDay: e.all_day })),
    ...sessions.map(s => ({ id: s.id, title: `${s.title} — ${s.client_name}`, time: s.scheduled_at, clientId: s.client_id, kind: 'session' as const })),
  ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

  const visibleTasks = tasks.filter(t => !doneIds.has(t.id))
  const todayStartOfDay = new Date()
  todayStartOfDay.setHours(0, 0, 0, 0)

  async function markDone(taskId: string) {
    setDoneIds(prev => new Set(prev).add(taskId))
    const supabase = createClient()
    await supabase.from('tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', taskId)
  }

  if (timedItems.length === 0 && visibleTasks.length === 0) return null

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-500">Today</h2>
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {visibleTasks.map((task, i) => {
          const overdue = new Date(task.due_date) < todayStartOfDay
          const isLast = i === visibleTasks.length - 1 && timedItems.length === 0
          return (
            <div
              key={`task-${task.id}`}
              className={`flex items-center gap-4 px-5 py-4 ${!isLast ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
            >
              <button
                onClick={() => markDone(task.id)}
                title="Mark done"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 transition-colors hover:bg-amber-500/20 dark:bg-amber-500/15 dark:text-amber-400"
              >
                <CheckSquare size={15} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{task.title}</p>
                <p className="text-xs text-gray-500 dark:text-slate-500">
                  {task.project_name ? `${task.project_name} — ` : ''}Due {fmtDueDate(task.due_date)}
                </p>
              </div>
              {overdue && (
                <span className="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600 dark:bg-red-500/15 dark:text-red-400">
                  Overdue
                </span>
              )}
            </div>
          )
        })}
        {timedItems.map((item, i) => (
          <div
            key={`${item.kind}-${item.id}`}
            className={`flex items-center gap-4 px-5 py-4 ${i < timedItems.length - 1 ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              item.kind === 'meeting'
                ? 'bg-violet-500/10 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400'
                : item.kind === 'session'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
                  : 'bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400'
            }`}>
              {item.kind === 'meeting' ? <Video size={15} /> : item.kind === 'session' ? <Clock3 size={15} /> : <Calendar size={15} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{item.title}</p>
              <p className="text-xs text-gray-500 dark:text-slate-500">
                {fmtTime(item.time, item.kind === 'event' ? item.allDay : false)}
              </p>
            </div>
            {item.kind === 'meeting' && (
              <Link
                href={`/dashboard/video/${item.id}`}
                className="shrink-0 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-cyan-600"
              >
                Join
              </Link>
            )}
            {item.kind === 'session' && (
              <Link
                href={`/dashboard/clients/${item.clientId}/sessions/${item.id}`}
                className="shrink-0 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-600"
              >
                View
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
