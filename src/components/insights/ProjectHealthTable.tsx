export type ProjectHealth = {
  id: string
  name: string
  colour: string
  due_date: string | null
  total_tasks: number
  done_tasks: number
  hours: number
}

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000)
}

export default function ProjectHealthTable({ projects, projectLabel }: { projects: ProjectHealth[]; projectLabel: { singular: string; plural: string } }) {
  if (projects.length === 0) return null

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h3 className="mb-5 text-sm font-bold uppercase tracking-wide text-gray-500">{projectLabel.singular} health</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="pb-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">{projectLabel.singular}</th>
              <th className="pb-3 text-center text-xs font-bold uppercase tracking-wide text-gray-400">Tasks</th>
              <th className="pb-3 px-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Progress</th>
              <th className="pb-3 text-center text-xs font-bold uppercase tracking-wide text-gray-400">Hours</th>
              <th className="pb-3 text-right text-xs font-bold uppercase tracking-wide text-gray-400">Deadline</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {projects.map(p => {
              const pct = p.total_tasks > 0 ? Math.round((p.done_tasks / p.total_tasks) * 100) : 0
              const days = p.due_date ? daysUntil(p.due_date) : null
              const deadlineColour = days === null
                ? 'text-gray-400'
                : days < 0 ? 'text-red-600'
                : days <= 7 ? 'text-amber-600'
                : 'text-gray-500'
              const deadlineText = days === null ? '—'
                : days < 0 ? `${Math.abs(days)}d overdue`
                : days === 0 ? 'Today'
                : `${days}d`

              return (
                <tr key={p.id}>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: p.colour }} />
                      <span className="font-semibold text-gray-900">{p.name}</span>
                    </div>
                  </td>
                  <td className="py-3 text-center font-semibold text-gray-500">
                    {p.done_tasks}/{p.total_tasks}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-2 rounded-full bg-cyan-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-9 text-right text-xs font-bold text-gray-500">{pct}%</span>
                    </div>
                  </td>
                  <td className="py-3 text-center font-semibold text-gray-500">{p.hours.toFixed(1)}h</td>
                  <td className={`py-3 text-right font-bold ${deadlineColour}`}>{deadlineText}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

