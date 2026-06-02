'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type Task = {
  id: string
  title: string
  priority: string
  status: string
  due_date: string | null
  notes: string | null
  assignee_id: string | null
  completed_at: string | null
}

const PRIORITY_COLOURS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high:   'bg-orange-100 text-orange-700',
  normal: 'bg-blue-100 text-blue-700',
  low:    'bg-gray-100 text-gray-500',
}

const STATUS_ORDER = ['todo', 'in_progress', 'done'] as const
const STATUS_LABELS: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' }

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000)
}

export default function TaskList({ initialTasks, projectId, currentUserId }: {
  initialTasks: Task[]
  projectId: string
  currentUserId: string
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState(initialTasks)

  async function advanceStatus(task: Task) {
    const next = STATUS_ORDER[STATUS_ORDER.indexOf(task.status as typeof STATUS_ORDER[number]) + 1]
    if (!next) return

    const supabase = createClient()
    const updates: Partial<Task> & { completed_at?: string | null } = { status: next }
    if (next === 'done') updates.completed_at = new Date().toISOString()

    await supabase.from('tasks').update(updates).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t))
    router.refresh()
  }

  async function revertStatus(task: Task) {
    const prev = STATUS_ORDER[STATUS_ORDER.indexOf(task.status as typeof STATUS_ORDER[number]) - 1]
    if (!prev) return

    const supabase = createClient()
    await supabase.from('tasks').update({ status: prev, completed_at: null }).eq('id', task.id)
    setTasks(p => p.map(t => t.id === task.id ? { ...t, status: prev, completed_at: null } : t))
    router.refresh()
  }

  async function deleteTask(id: string) {
    const supabase = createClient()
    await supabase.from('tasks').delete().eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const grouped = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = tasks.filter(t => t.status === s)
    return acc
  }, {} as Record<string, Task[]>)

  return (
    <div className="space-y-6">
      {STATUS_ORDER.map(status => (
        <div key={status}>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {STATUS_LABELS[status]} ({grouped[status].length})
          </h3>
          {grouped[status].length === 0 ? (
            <p className="text-xs text-gray-300 pl-1">None</p>
          ) : (
            <ul className="space-y-2">
              {grouped[status].map(task => {
                const days = task.due_date ? daysUntil(task.due_date) : null
                const overdue = days !== null && days < 0 && status !== 'done'
                return (
                  <li key={task.id} className={`flex items-start gap-3 p-3 rounded-xl border ${overdue ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">{task.title}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORITY_COLOURS[task.priority]}`}>
                          {task.priority}
                        </span>
                      </div>
                      {task.notes && <p className="text-xs text-gray-500 mt-0.5">{task.notes}</p>}
                      {task.due_date && (
                        <p className={`text-xs mt-0.5 ${overdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                          {overdue ? `${Math.abs(days!)}d overdue` : days === 0 ? 'Due today' : `Due in ${days}d`}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0 items-end">
                      {status !== 'done' && (
                        <button onClick={() => advanceStatus(task)}
                          className="text-xs text-blue-600 hover:underline">
                          {status === 'todo' ? 'Start →' : 'Done ✓'}
                        </button>
                      )}
                      {status !== 'todo' && (
                        <button onClick={() => revertStatus(task)}
                          className="text-xs text-gray-400 hover:underline">
                          ← Back
                        </button>
                      )}
                      <button onClick={() => deleteTask(task.id)}
                        className="text-xs text-red-400 hover:text-red-600">
                        Delete
                      </button>
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
