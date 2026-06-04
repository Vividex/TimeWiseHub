type DayStatus = 'active' | 'idle' | 'weekend' | 'future'

function getDayStatus(dateStr: string, activeDates: Set<string>): DayStatus {
  const d = new Date(dateStr)
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  if (d > today) return 'future'
  const dow = d.getDay()
  if (dow === 0 || dow === 6) return 'weekend'
  return activeDates.has(dateStr) ? 'active' : 'idle'
}

const STATUS_STYLE: Record<DayStatus, string> = {
  active:  'bg-green-500',
  idle:    'bg-red-200',
  weekend: 'bg-gray-100',
  future:  'bg-gray-50',
}

export default function IdleReport({ activeDates, totalWorkdays, activeDays }: {
  activeDates: Set<string>
  totalWorkdays: number
  activeDays: number
}) {
  // Build last 35 days (5 weeks) grid
  const cells: string[] = []
  for (let i = 34; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    cells.push(d.toISOString().slice(0, 10))
  }

  const idleDays = totalWorkdays - activeDays
  const pct = totalWorkdays > 0 ? Math.round((activeDays / totalWorkdays) * 100) : 0

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-gray-500">Idle detection — last 5 weeks</h3>
      <p className="mb-5 text-xs font-semibold text-gray-400">Workdays with at least one time entry logged are green. Red = no time logged.</p>

      {/* Heatmap grid */}
      <div className="mb-5 grid grid-cols-7 gap-1.5">
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} className="text-center text-xs font-bold text-gray-300">{d}</div>
        ))}
        {/* Pad to start on correct weekday */}
        {Array.from({ length: (new Date(cells[0]).getDay() + 6) % 7 }, (_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {cells.map(dateStr => {
          const status = getDayStatus(dateStr, activeDates)
          return (
            <div
              key={dateStr}
              title={dateStr}
              className={`h-6 w-full rounded-md ${STATUS_STYLE[status]}`}
            />
          )
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 border-t border-gray-100 pt-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Active days</p>
          <p className="mt-1 text-2xl font-black text-green-600">{activeDays}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Idle days</p>
          <p className="mt-1 text-2xl font-black text-red-500">{idleDays}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Active rate</p>
          <p className="mt-1 text-2xl font-black text-gray-900">{pct}%</p>
        </div>
      </div>
    </div>
  )
}
