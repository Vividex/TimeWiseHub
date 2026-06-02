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
  const deadlineColour = days === null ? '' : days < 0 ? 'text-red-600' : days <= 3 ? 'text-orange-500' : days <= 7 ? 'text-yellow-600' : 'text-gray-400'

  return (
    <Link href={`/dashboard/projects/${project.id}`}
      className="bg-white rounded-2xl shadow hover:shadow-md transition-shadow p-5 block">
      <div className="flex items-start gap-3">
        <div className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: project.colour }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{project.name}</p>
          {project.description && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{project.description}</p>
          )}

          {total > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                <span>{done}/{total} tasks</span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: project.colour }} />
              </div>
            </div>
          )}

          {days !== null && (
            <p className={`text-xs mt-2 font-medium ${deadlineColour}`}>
              {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}
