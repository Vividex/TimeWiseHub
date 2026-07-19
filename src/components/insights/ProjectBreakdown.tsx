export type ProjectBar = { name: string; colour: string; hours: number }

export default function ProjectBreakdown({ projects, totalHours, projectLabel }: {
  projects: ProjectBar[]
  totalHours: number
  projectLabel: { singular: string; plural: string }
}) {
  if (projects.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">Time by {projectLabel.singular.toLowerCase()}</h3>
        <p className="text-sm font-semibold text-gray-400">
          No {projectLabel.singular.toLowerCase()}-linked entries yet. Link tasks to time entries to see this breakdown.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h3 className="mb-5 text-sm font-bold uppercase tracking-wide text-gray-500">Time by {projectLabel.singular.toLowerCase()}</h3>
      <div className="space-y-4">
        {projects.map(p => {
          const pct = totalHours > 0 ? (p.hours / totalHours) * 100 : 0
          return (
            <div key={p.name}>
              <div className="mb-1.5 flex items-center justify-between text-sm font-semibold">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: p.colour }} />
                  <span className="text-gray-900">{p.name}</span>
                </div>
                <span className="text-gray-400">{p.hours.toFixed(1)}h · {Math.round(pct)}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-2.5 rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: p.colour }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
