// src/components/projects/ProjectTaskGrid.tsx
'use client'

import { useState } from 'react'
import TaskForm from '@/components/projects/TaskForm'
import TaskDrawer, { type DrawerTask } from '@/components/projects/TaskDrawer'

const STATUS_DOT: Record<string, string> = {
  todo: 'bg-gray-300 dark:bg-slate-600',
  in_progress: 'bg-amber-400',
  done: 'bg-green-500',
}

const STATUS_BADGE: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  done: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
}

const STATUS_LABEL: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
}

const PRIORITY_COLOUR: Record<string, string> = {
  high: 'text-red-500',
  medium: 'text-amber-500',
  low: 'text-gray-400',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export default function ProjectTaskGrid({
  projectId,
  assigneeId,
  initialTasks,
  orgMembers,
}: {
  projectId: string
  assigneeId: string
  initialTasks: DrawerTask[]
  orgMembers?: { userId: string; displayName: string }[]
}) {
  const [tasks, setTasks] = useState<DrawerTask[]>(initialTasks)
  const [active, setActive] = useState<DrawerTask | null>(null)

  function handleAdd(task: DrawerTask) {
    setTasks(prev => [...prev, task])
  }
  function handleSaved(updated: DrawerTask) {
    setTasks(prev => prev.map(t => (t.id === updated.id ? updated : t)))
  }
  function handleDeleted(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div className="space-y-5">
      <TaskForm projectId={projectId} assigneeId={assigneeId} orgMembers={orgMembers} onAdd={handleAdd} />

      {tasks.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 px-6 py-10 text-center text-sm font-semibold text-gray-400 dark:border-slate-700">
          No tasks yet. Add the first one.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-800">
          {tasks.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setActive(t)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/60 ${
                i > 0 ? 'border-t border-gray-100 dark:border-slate-800' : ''
              }`}
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[t.status] ?? 'bg-gray-300'}`} />
              <span className="min-w-0 flex-1 text-sm font-semibold text-gray-900 dark:text-slate-100">
                {t.title}
              </span>
              {t.priority && (
                <span className={`shrink-0 text-xs font-bold uppercase ${PRIORITY_COLOUR[t.priority] ?? 'text-gray-400'}`}>
                  {t.priority}
                </span>
              )}
              {t.due_date && (
                <span className="shrink-0 text-xs text-gray-400">
                  {fmtDate(t.due_date)}
                </span>
              )}
              <span className={`shrink-0 rounded-xl px-2 py-0.5 text-xs font-bold ${STATUS_BADGE[t.status] ?? STATUS_BADGE.todo}`}>
                {STATUS_LABEL[t.status] ?? t.status}
              </span>
            </button>
          ))}
        </div>
      )}

      {active && (
        <TaskDrawer
          task={active}
          orgMembers={orgMembers}
          onClose={() => setActive(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
