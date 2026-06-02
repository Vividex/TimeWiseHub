'use client'

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export default function TimeSummary({ todaySeconds, weekSeconds }: { todaySeconds: number; weekSeconds: number }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-white rounded-2xl shadow p-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Today</p>
        <p className="text-3xl font-bold text-gray-900">{formatDuration(todaySeconds)}</p>
      </div>
      <div className="bg-white rounded-2xl shadow p-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">This week</p>
        <p className="text-3xl font-bold text-gray-900">{formatDuration(weekSeconds)}</p>
      </div>
    </div>
  )
}
