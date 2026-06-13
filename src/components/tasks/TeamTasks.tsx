'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type AssignedTask = {
  id: string
  title: string
  priority: string
  status: string
  due_date: string | null
  assignee_id: string
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

export default function TeamTasks({
  initialTasks,
  orgMembers,
}: {
  initialTasks: AssignedTask[]
  orgMembers: OrgMember[]
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState(initialTasks)
  const [loading, setLoading] = useState<string | null>(null)

  function memberName(userId: string): string {
    return orgMembers.find(m => m.userId === userId)?.displayName ?? userId
  }

  async function retrieve(taskId: string) {
    setLoading(taskId)
    const supabase = createClient()
    await supabase.from('tasks').update({ assignee_id: null }).eq('id', taskId)
    setTasks(prev => prev.filter(t => t.id !== taskId))
    setLoading(null)
    router.refresh()
  }

  if (tasks.length === 0) {
    return (
      <p className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-xs font-semibold text-gray-500">
        No tasks currently assigned to team members.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {tasks.map(task => {
        const days = task.due_date ? daysUntil(task.due_date) : null
        const overdue = days !== null && days < 0
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
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${PRIORITY_COLOURS[task.priority] ?? PRIORITY_COLOURS.normal}`}>
                  {task.priority}
                </span>
              </div>
              <p className="mt-1 text-xs font-semibold text-gray-500">
                Assigned to {memberName(task.assignee_id)}
              </p>
              {task.due_date && (
                <p className={`mt-0.5 text-xs font-bold ${overdue ? 'text-red-600' : 'text-gray-500'}`}>
                  {overdue
                    ? `${Math.abs(days!)}d overdue`
                    : days === 0 ? 'Due today' : `Due in ${days}d`}
                </p>
              )}
            </div>
            <button
              onClick={() => retrieve(task.id)}
              disabled={loading === task.id}
              className="shrink-0 rounded-xl bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-200 disabled:opacity-50"
            >
              {loading === task.id ? 'Retrieving…' : 'Retrieve'}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
