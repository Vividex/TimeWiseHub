'use client'

import { useState } from 'react'
import TaskDrawer, { type DrawerTask } from '@/components/projects/TaskDrawer'

const PRIORITY_CONFIG: Record<string, { label: string; classes: string }> = {
  urgent: { label: 'Urgent', classes: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30' },
  high:   { label: 'High',   classes: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-400 dark:border-orange-500/30' },
  normal: { label: 'Normal', classes: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/30' },
  low:    { label: 'Low',    classes: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-slate-500/15 dark:text-slate-400 dark:border-slate-500/30' },
}

const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  todo:        { label: 'To Do',       dot: 'bg-slate-500' },
  in_progress: { label: 'In Progress', dot: 'bg-amber-400' },
  done:        { label: 'Done',        dot: 'bg-emerald-400' },
}

export default function MyWork({
  myTasks,
  orgMembers,
}: {
  myTasks: (DrawerTask & { projectName: string | null; clientId: string | null })[]
  orgMembers?: { userId: string; displayName: string }[]
}) {
  const [tasks, setTasks] = useState(myTasks)
  const [active, setActive] = useState<DrawerTask | null>(null)

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-500">My tasks</h2>

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-semibold text-gray-500 dark:text-slate-500">Nothing assigned to you right now.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-slate-800 dark:bg-slate-900">
          {tasks.map((t, i) => {
            const priority = PRIORITY_CONFIG[t.priority] ?? PRIORITY_CONFIG.normal
            const status = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.todo
            const dueLabel = t.due_date
              ? new Date(t.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
              : null
            return (
              <button
                key={t.id}
                onClick={() => setActive(t)}
                className={`flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/60 ${
                  i < tasks.length - 1 ? 'border-b border-gray-100 dark:border-slate-800' : ''
                }`}
              >
                <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${status.dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{t.title}</p>
                  {t.projectName && (
                    <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-slate-500">{t.projectName}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {dueLabel && (
                    <span className="text-xs font-medium text-gray-500 dark:text-slate-500">{dueLabel}</span>
                  )}
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${priority.classes}`}>
                    {priority.label}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {active && (
        <TaskDrawer
          task={active}
          orgMembers={orgMembers}
          onClose={() => setActive(null)}
          onSaved={u => setTasks(prev => prev.map(t => (t.id === u.id ? { ...t, ...u } : t)))}
          onDeleted={id => setTasks(prev => prev.filter(t => t.id !== id))}
        />
      )}
    </div>
  )
}
