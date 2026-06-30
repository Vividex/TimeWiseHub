export type DayBar = { label: string; hours: number }

export default function BarChart({ days, title }: { days: DayBar[]; title: string }) {
  const max = Math.max(...days.map(d => d.hours), 0.5)

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-6 text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-slate-500">{title}</h3>
      <div className="flex items-end gap-2" style={{ height: '140px' }}>
        {days.map(day => {
          const pct = (day.hours / max) * 100
          return (
            <div key={day.label} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs font-semibold text-gray-400 dark:text-slate-400" style={{ minHeight: '18px' }}>
                {day.hours > 0 ? `${day.hours.toFixed(1)}h` : ''}
              </span>
              <div className="flex w-full items-end rounded-xl bg-gray-100 dark:bg-slate-800" style={{ height: '96px' }}>
                <div
                  className="w-full rounded-xl transition-all"
                  style={{ height: `${day.hours > 0 ? Math.max(pct, 6) : 0}%`, backgroundColor: '#22d3ee' }}
                />
              </div>
              <span className="text-xs font-bold text-gray-400 dark:text-slate-400">{day.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
