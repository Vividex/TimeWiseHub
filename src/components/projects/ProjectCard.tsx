'use client'

import Link from 'next/link'

type Task = { id: string; status: string }
type Project = {
  id: string
  name: string
  description: string | null
  colour: string
  due_date: string | null
  status: string
  tasks: Task[]
}

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000)
}

export default function ProjectCard({ project }: { project: Project }) {
  const tasks = project.tasks ?? []
  const total = tasks.length
  const done  = tasks.filter(t => t.status === 'done').length
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0

  const days = project.due_date ? daysUntil(project.due_date) : null
  const deadlineColour = days === null ? '' : days < 0 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-gray-500'

  return (
    <Link href={`/dashboard/projects/${project.id}`}
      className="block rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="mt-1.5 h-4 w-4 shrink-0 rounded-full shadow-sm" style={{ backgroundColor: project.colour }} />
        <div className="flex-1 min-w-0">
          <p className="truncate text-lg font-black text-gray-900">{project.name}</p>
          {project.description && (
            <p className="mt-1 truncate text-sm font-medium text-gray-500">{project.description}</p>
          )}

          {total > 0 && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-xs font-semibold text-gray-500">
                <span>{done}/{total} tasks</span>
                <span>{pct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: project.colour }} />
              </div>
            </div>
          )}

          {days !== null && (
            <p className={`mt-3 text-xs font-bold ${deadlineColour}`}>
              {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}

