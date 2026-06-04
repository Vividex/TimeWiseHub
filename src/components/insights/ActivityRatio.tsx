export default function ActivityRatio({ hoursThisWeek, activeDays }: {
  hoursThisWeek: number
  activeDays: number
}) {
  const TARGET_HOURS = 40
  const pct = Math.min(Math.round((hoursThisWeek / TARGET_HOURS) * 100), 100)
  const colour = pct >= 75 ? 'bg-green-500' : pct >= 40 ? 'bg-blue-600' : 'bg-orange-500'

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h3 className="mb-6 text-sm font-bold uppercase tracking-wide text-gray-500">Work week coverage</h3>

      <div className="mb-4">
        <div className="mb-2 flex items-end justify-between">
          <span className="text-5xl font-black tracking-tight text-gray-900">{pct}%</span>
          <span className="text-sm font-semibold text-gray-400">of 40h</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
          <div className={`h-3 rounded-full transition-all ${colour}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Hours logged</p>
          <p className="mt-1 text-2xl font-black text-gray-900">{hoursThisWeek.toFixed(1)}h</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Active days</p>
          <p className="mt-1 text-2xl font-black text-gray-900">{activeDays} / 5</p>
        </div>
      </div>
    </div>
  )
}
