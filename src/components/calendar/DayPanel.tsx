'use client'

import Link from 'next/link'
import type { CalendarItem } from './CalendarView'

const TYPE_LABELS: Record<string, string> = { event: 'Event', project: 'Project deadline', task: 'Task due', leave: 'Approved leave', session: 'Session' }

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
}

export default function DayPanel({ date, items, onAddEvent, onClose }: {
  date: string
  items: CalendarItem[]
  onAddEvent: () => void
  onClose: () => void
}) {
  const formatted = new Date(date + 'T00:00:00').toLocaleDateString('default', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-gray-900">{formatted}</h3>
        <button onClick={onClose} className="rounded-xl bg-gray-50 px-3 py-2 text-sm font-bold text-gray-500 transition-colors hover:text-gray-900">✕</button>
      </div>

      {items.length === 0 ? (
        <p className="mb-4 text-sm font-semibold text-gray-500">Nothing scheduled.</p>
      ) : (
        <ul className="space-y-3 mb-4">
          {items.map(item => {
            const inner = (
              <>
                <div className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.colour }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">{item.label}</p>
                  {item.allDay && (
                    <p className="mt-0.5 text-xs font-semibold text-gray-500">All day</p>
                  )}
                  {!item.allDay && item.startTime && (
                    <p className="mt-0.5 text-xs font-semibold text-gray-500">
                      {fmtTime(item.startTime)}{item.endTime ? ` – ${fmtTime(item.endTime)}` : ''}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs font-medium text-gray-400">
                    {TYPE_LABELS[item.type]}{item.priority ? ` · ${item.priority}` : ''}
                  </p>
                  {item.description && (
                    <p className="mt-2 text-sm text-gray-600 leading-relaxed">{item.description}</p>
                  )}
                </div>
              </>
            )

            if (item.type === 'session' && item.clientId) {
              return (
                <li key={item.key}>
                  <Link
                    href={`/dashboard/clients/${item.clientId}/sessions/${item.id}`}
                    className="flex gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 transition-colors hover:bg-cyan-50"
                  >
                    {inner}
                  </Link>
                </li>
              )
            }

            return (
              <li key={item.key} className="flex gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                {inner}
              </li>
            )
          })}
        </ul>
      )}

      <button onClick={onAddEvent}
        className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold">
        + Add event on this day
      </button>
    </div>
  )
}
