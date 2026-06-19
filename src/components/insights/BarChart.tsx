export type DayBar = { label: string; hours: number }

export default function BarChart({ days, title }: { days: DayBar[]; title: string }) {
  const max = Math.max(...days.map(d => d.hours), 0.5)

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h3 className="mb-6 text-sm font-bold uppercase tracking-widest text-slate-500">{title}</h3>
      <div className="flex items-end gap-2" style={{ height: '140px' }}>
        {days.map(day => {
          const pct = (day.hours / max) * 100
          return (
            <div key={day.label} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs font-semibold text-slate-400" style={{ minHeight: '18px' }}>
                {day.hours > 0 ? `${day.hours.toFixed(1)}h` : ''}
              </span>
              <div className="flex w-full items-end rounded-xl" style={{ height: '96px', backgroundColor: '#1e293b' }}>
                <div
                  className="w-full rounded-xl transition-all"
                  style={{ height: `${day.hours > 0 ? Math.max(pct, 6) : 0}%`, backgroundColor: '#22d3ee' }}
                />
              </div>
              <span className="text-xs font-bold text-slate-400">{day.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

