'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

type PoolTask = {
  id: string
  title: string
  priority: string
  status: string
  due_date: string | null
  notes: string | null
  assignee_id: string | null
  completed_at: string | null
  projects: { id: string; name: string; colour: string } | null
}

const PRIORITY_COLOURS: Record<string, string> = {
  urgent: 'bg-red-50 text-red-600',
  high:   'bg-amber-50 text-amber-600',
  normal: 'bg-cyan-50 text-cyan-600',
  low:    'bg-gray-100 text-gray-500',
}

const STATUS_ORDER = ['todo', 'in_progress', 'done'] as const
const STATUS_LABELS: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
}

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000)
}

export default function MyTasks({
  initialTasks,
  currentUserId,
}: {
  initialTasks: PoolTask[]
  currentUserId: string
}) {
  const [tasks, setTasks] = useState(initialTasks)

  async function advanceStatus(task: PoolTask) {
    const idx = STATUS_ORDER.indexOf(task.status as typeof STATUS_ORDER[number])
    const next = STATUS_ORDER[idx + 1]
    if (!next) return
    const supabase = createClient()
    const updates: Record<string, unknown> = { status: next }
    if (next === 'done') updates.completed_at = new Date().toISOString()
    await supabase.from('tasks').update(updates).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t))
  }

  async function revertStatus(task: PoolTask) {
    const idx = STATUS_ORDER.indexOf(task.status as typeof STATUS_ORDER[number])
    const prev = STATUS_ORDER[idx - 1]
    if (!prev) return
    const supabase = createClient()
    await supabase.from('tasks').update({ status: prev, completed_at: null }).eq('id', task.id)
    setTasks(p => p.map(t => t.id === task.id ? { ...t, status: prev, completed_at: null } : t))
  }

  if (tasks.length === 0) {
    return (
      <p className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-xs font-semibold text-gray-500">
        You have no assigned tasks.
      </p>
    )
  }

  const grouped = STATUS_ORDER.reduce<Record<string, PoolTask[]>>(
    (acc, s) => { acc[s] = tasks.filter(t => t.status === s); return acc },
    {} as Record<string, PoolTask[]>,
  )

  return (
    <div className="space-y-6">
      {STATUS_ORDER.map(status => (
        <div key={status}>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">
            {STATUS_LABELS[status]} ({grouped[status].length})
          </h3>
          {grouped[status].length === 0 ? (
            <p className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-xs font-semibold text-gray-500">
              None
            </p>
          ) : (
            <ul className="space-y-2">
              {grouped[status].map(task => {
                const days = task.due_date ? daysUntil(task.due_date) : null
                const overdue = days !== null && days < 0 && status !== 'done'
                return (
                  <li
                    key={task.id}
                    className={`flex items-start gap-3 rounded-2xl border p-4 ${overdue ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'}`}
                  >
                    <div className="flex-1 min-w-0">
                      {task.projects && (
                        <div className="mb-1 flex items-center gap-1.5">
                          <div
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: task.projects.colour }}
                          />
                          <span className="text-xs font-semibold text-gray-400 truncate">
                            {task.projects.name}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-gray-900">{task.title}</span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${PRIORITY_COLOURS[task.priority]}`}>
                          {task.priority}
                        </span>
                      </div>
                      {task.due_date && (
                        <p className={`mt-1 text-xs font-bold ${overdue ? 'text-red-600' : 'text-gray-500'}`}>
                          {overdue
                            ? `${Math.abs(days!)}d overdue`
                            : days === 0 ? 'Due today' : `Due in ${days}d`}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0 items-end">
                      {status !== 'done' && (
                        <button
                          onClick={() => advanceStatus(task)}
                          className="text-xs font-semibold text-cyan-600 transition-colors hover:text-cyan-700"
                        >
                          {status === 'todo' ? 'Start' : 'Done'}
                        </button>
                      )}
                      {status !== 'todo' && (
                        <button
                          onClick={() => revertStatus(task)}
                          className="text-xs font-semibold text-gray-500 transition-colors hover:text-gray-900"
                        >
                          Back
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
