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

type OrgMember = { userId: string; displayName: string }

const PRIORITY_COLOURS: Record<string, string> = {
  urgent: 'bg-red-50 text-red-600',
  high:   'bg-amber-50 text-amber-600',
  normal: 'bg-cyan-50 text-cyan-600',
  low:    'bg-gray-100 text-gray-500',
}

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000)
}

export default function TaskPool({
  initialTasks,
  orgMembers,
  currentUserId,
  currentUserRole,
}: {
  initialTasks: PoolTask[]
  orgMembers: OrgMember[]
  currentUserId: string
  currentUserRole: string
}) {
  const [tasks, setTasks] = useState(initialTasks)
  const [assignTargets, setAssignTargets] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState<string | null>(null)

  const canForceAssign = ['owner', 'admin', 'manager'].includes(currentUserRole)

  async function claim(taskId: string) {
    setLoading(taskId)
    const supabase = createClient()
    await supabase.from('tasks').update({ assignee_id: currentUserId }).eq('id', taskId)
    setTasks(prev => prev.filter(t => t.id !== taskId))
    setLoading(null)
  }

  async function forceAssign(taskId: string) {
    const userId = assignTargets[taskId]
    if (!userId) return
    setLoading(taskId)
    const supabase = createClient()
    await supabase.from('tasks').update({ assignee_id: userId }).eq('id', taskId)
    fetch('/api/tasks/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, assigneeId: userId }),
    }).catch(() => {})
    setTasks(prev => prev.filter(t => t.id !== taskId))
    setLoading(null)
  }

  if (tasks.length === 0) {
    return (
      <p className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-xs font-semibold text-gray-500">
        No available tasks — all tasks are assigned.
      </p>
    )
  }

  // Group by project
  const groups = tasks.reduce<Record<string, { project: PoolTask['projects']; tasks: PoolTask[] }>>(
    (acc, task) => {
      const key = task.projects?.id ?? 'unknown'
      if (!acc[key]) acc[key] = { project: task.projects, tasks: [] }
      acc[key].tasks.push(task)
      return acc
    },
    {},
  )

  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([projectId, group]) => (
        <div key={projectId}>
          <div className="mb-3 flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: group.project?.colour ?? '#6b7280' }}
            />
            <h3 className="text-sm font-bold text-gray-700">
              {group.project?.name ?? 'Unknown project'}
            </h3>
          </div>
          <ul className="space-y-2">
            {group.tasks.map(task => {
              const days = task.due_date ? daysUntil(task.due_date) : null
              const overdue = days !== null && days < 0
              return (
                <li
                  key={task.id}
                  className={`rounded-2xl border p-4 ${overdue ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-gray-900">{task.title}</span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${PRIORITY_COLOURS[task.priority]}`}>
                          {task.priority}
                        </span>
                      </div>
                      {task.notes && (
                        <p className="mt-1 text-xs font-medium text-gray-500 truncate">{task.notes}</p>
                      )}
                      {task.due_date && (
                        <p className={`mt-1 text-xs font-bold ${overdue ? 'text-red-600' : 'text-gray-500'}`}>
                          {overdue ? `${Math.abs(days!)}d overdue` : days === 0 ? 'Due today' : `Due in ${days}d`}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 shrink-0 items-end">
                      <button
                        onClick={() => claim(task.id)}
                        disabled={loading === task.id}
                        className="rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
                      >
                        {loading === task.id ? '…' : 'Claim'}
                      </button>
                      {canForceAssign && orgMembers.length > 0 && (
                        <div className="flex gap-1.5 items-center">
                          <select
                            value={assignTargets[task.id] ?? ''}
                            onChange={e =>
                              setAssignTargets(prev => ({ ...prev, [task.id]: e.target.value }))
                            }
                            className="rounded-xl border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                          >
                            <option value="">Assign to…</option>
                            {orgMembers.map(m => (
                              <option key={m.userId} value={m.userId}>{m.displayName}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => forceAssign(task.id)}
                            disabled={!assignTargets[task.id] || loading === task.id}
                            className="rounded-xl bg-gray-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-gray-900 disabled:opacity-40"
                          >
                            Assign
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
