import Link from 'next/link'
import { Calendar, Video } from 'lucide-react'

export type UpcomingMeeting = { id: string; title: string; starts_at: string }
export type UpcomingEvent  = { id: string; title: string; start_at: string; end_at: string | null; all_day: boolean }

function fmtTime(iso: string, allDay: boolean) {
  if (allDay) return 'All day'
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function DashboardUpcoming({
  meetings,
  events,
}: {
  meetings: UpcomingMeeting[]
  events: UpcomingEvent[]
}) {
  type Item = { id: string; title: string; time: string; kind: 'meeting' | 'event'; allDay?: boolean }

  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const combined: Item[] = [
    ...meetings.map(m => ({ id: m.id, title: m.title, time: m.starts_at, kind: 'meeting' as const })),
    ...events.map(e => ({ id: e.id, title: e.title, time: e.start_at, kind: 'event' as const, allDay: e.all_day })),
  ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

  if (combined.length === 0) return null

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-500">Upcoming</h2>
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {combined.map((item, i) => {
          const isToday = new Date(item.time) <= todayEnd
          return (
            <div
              key={item.id}
              className={`flex items-center gap-4 px-5 py-4 ${i < combined.length - 1 ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                item.kind === 'meeting'
                  ? 'bg-violet-500/10 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400'
                  : 'bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400'
              }`}>
                {item.kind === 'meeting' ? <Video size={15} /> : <Calendar size={15} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{item.title}</p>
                <p className="text-xs text-gray-500 dark:text-slate-500">{fmtTime(item.time, item.allDay ?? false)}</p>
              </div>
              {isToday && (
                <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
                  Today
                </span>
              )}
              {item.kind === 'meeting' && (
                <Link
                  href={`/dashboard/video/${item.id}`}
                  className="shrink-0 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-cyan-600"
                >
                  Join
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
