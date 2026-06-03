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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-600">Today</p>
        <p className="text-4xl font-black tracking-tight text-gray-900">{formatDuration(todaySeconds)}</p>
      </div>
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-600">This week</p>
        <p className="text-4xl font-black tracking-tight text-gray-900">{formatDuration(weekSeconds)}</p>
      </div>
    </div>
  )
}
